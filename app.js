var logger = require('koa-logger');
var router = require('koa-router');
var parse = require('co-body');
var serve = require('koa-static');
var koa = require('koa');
var views = require('co-views');
var spawn = require('child_process').spawn;
var markdown = require('markdown').markdown;

var monk = require('monk');
var wrap = require('co-monk');
var db = monk('localhost/pastebin');
var collection = db.get('pastes');

var app = koa();

app.use(logger());
app.use(router(app));

var pastes = wrap(collection);

app.get('/', index);
app.get('/:id', show);
app.get('/f/:id', fork);
app.get('/r/:id', raw);
app.post('/paste/create', create);

var render = views(__dirname + '/views', { map: { jade: 'jade' }, default: 'jade' });

function *index() {
    this.body = yield render('index');
}

function *fork() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if(!res) this.throw(404,'Invalid paste');
    this.body = yield render('fork', { paste: res });
}

function *raw() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if(!res) this.throw(404,'Invalid paste');
    this.set('Content-Type', 'text');
    this.body = res.raw;
}

function *show() {
    var id = this.params.id;
    var res = yield pastes.findOne({id: id}); 
    if(!res) this.throw(404,'Invalid paste');
    this.body = yield render('show', { paste: res });
}

function *create() {
    var paste = yield parse(this); 
    var count = yield pastes.count({});
    var keylen = 2;
    paste.id = Math.floor(Math.random()*16777215).toString(16).substr(0,keylen);

    // Make sure our ID is unique
    while(yield pastes.findOne({id: paste.id})) {
       keylen++; 
       paste.id = Math.floor(Math.random()*16777215).toString(16).substr(0,keylen);
    }

    paste.created_on = new Date;
    paste.raw = paste.code;

    paste.name = (paste.name != "" ? paste.name : "Untitled");

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
    this.redirect('/'+paste.id);
}

app.use(serve(__dirname + '/public'), { defer: true });

app.listen(3000);
