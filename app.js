var fileparse = require('co-busboy');
var fs = require('fs');
var koa = require('koa');
var logger = require('koa-logger');
var markdown = require('markdown').markdown;
var mime = require('./lib/mime.js').ext;
var monk = require('monk');
var parse = require('co-body');
var router = require('koa-router');
var serve = require('koa-static');
var spawn = require('child_process').spawn;
var views = require('co-views');
var wrap = require('co-monk');

var db = monk('localhost/pastebin'); // Your database
var collection = db.get('pastes');
var pastes = wrap(collection);
var root = "http://localhost:3000"; // Your server URL

var app = koa();

app.use(logger());
app.use(router(app));

app.get('/', index);
app.get('/:id', show);
app.get('/f/:id', fork);
app.get('/r/:id', raw);
app.post('/create', create);
app.post('/shorten', shorten);
app.post('/upload', upload);

var render = views(__dirname + '/views', { map: { jade: 'jade' }, default: 'jade' });

function *index() {
    this.body = yield render('index');
}

function *fork() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if (!res) this.throw(404,'Invalid paste');
    this.body = yield render('fork', { paste: res });
}

function *raw() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if (!res) this.throw(404,'Invalid paste');
    this.set('Content-Type', 'text');
    this.body = res.raw;
}

function *show() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if (!res) this.throw(404,'Invalid paste');
    if (res.url) {
        this.status = 301;
        this.redirect(res.url);
    }

    this.body = yield render('show', { paste: res });
}

function *shorten() {
    var paste = yield parse(this);
    var keylen = 2;

    paste.id = generateHex(keylen);
    while (yield pastes.findOne({id: paste.id})) {
        keylen++; 
        paste.id = generateHex(keylen);
    }

    paste.created_on = new Date;
    pastes.insert(paste);

    this.body = root + "/" + paste.id;
}

function *create() {
    var paste = yield parse(this); 
    var count = yield pastes.count({});
    var keylen = 2;

    paste.id = generateHex(keylen);
    while (yield pastes.findOne({id: paste.id})) {
        keylen++; 
        paste.id = generateHex(keylen);
    }

    paste.created_on = new Date;
    paste.raw = paste.code;

    paste.name = (paste.name ? paste.name : "Untitled");
    paste.syntax = (paste.syntax ? paste.syntax : "text");

    if(paste.syntax != "text") {
        var args = ['-l', paste.syntax, '-f', 'html', '-O', 'style=emacs,linenos=true'];
        var proc = spawn('pygmentize', args);

        proc.stdout.on("data", function(data) {
            paste.code = data;
        });

        proc.stdin.write(paste.code);
        proc.stdin.end();

        yield proc.on.bind(proc, "exit");
    } else {
        paste.code = markdown.toHTML(paste.code);
    }

    pastes.insert(paste);

    if (paste.return_path) this.body = root + "/" + paste.id;
    else this.redirect('/'+paste.id); 
}

function *upload() {
    // Allowed MIME-types
    var filetypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'text/plain': 'txt', 'application/zip': 'zip', 'video/webm': 'webm' }
    var keylen = 2;
    var filename = generateHex(keylen);

    while (yield pastes.findOne({filename: filename})) {
        keylen++; 
        filename = generateHex(keylen);
    }

    var parts = fileparse(this);
    var part, filepath, extension;

    while (part = yield parts) {
        extension = mime.getExt(part.filename);
        filepath = 'uploads/' + filename + extension;
        var stream = fs.createWriteStream('public/' + filepath);
        part.pipe(stream);
    }

    var buf = fs.readFileSync('public/' + filepath); 
    var mimetype = mime.getContentTypeBySig(buf);

    if(!filetypes[mimetype]) fs.unlinkSync('public/' + filepath);
    this.body = (filetypes[mimetype] ? root + "/" + filepath : "invalid filetype"); 
}


function generateHex(keylen) {
    return Math.floor(Math.random()*16777215).toString(16).substr(0,keylen);
}

app.use(serve(__dirname + '/public'), { defer: true });

app.listen(3000);
