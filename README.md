nbin
====

> Pastebin tool, file uploader, URL shortener
> nodejs/koa/mongodb

## Usage

Pasting is self-explanatory. See below for file uploads and URL shortening via cURL.

### Shorten URLs 
``` sh
$ curl --data-urlencode "url=$url" http://localhost:3000/shorten
```

### Files
``` sh
$ curl -F "image=@$file" http://localhost:3000/upload
```


## Demo

Live version at http://hax.cm
