# env-serve

HTTP(S) server for static files with dynamic config from env vars 

### Examples

```bash
### install
npm i -g env-serve

# for help
env-serve --help

# run simple server
env-serve

# change port and entry file
env-serve -p 3003 -f foo_bar.html

# run https server with selfsigned certs
env-serve -s -p 3003 -f index.html

# run server and change coanfig basing on env vars
EXPORT MY_TEST_VAL="My test value"; env-serve -f index.html

# change file type from html to js, now config.js should contains window.appConfig variable
env-serve -f config.js

# change default global config var name, now you should rename appConfig to fooBar
env-serve -g fooBar
```

### How it works?
Let's say you have an `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>My test page</title>
    <script>
        window.appConfig = {
            "MY_TEST_VAL": "Hello world",
            "MY_TEST_VAL_2": 123
        };
    </script>
</head>
<body>
<h2>Application config:</h2>
<pre></pre>
<script>
    const c = document.querySelector('pre');
    c.innerText = JSON.stringify(window.appConfig, null, 4);
</script>
</body>
</html>
```

now you can control variables in `window.appConfig` on server start. For example:
```bash
EXPORT MY_TEST_VAL="My test value"; env-serve -f index.html
```

Server runs on port 3000 with changed configuration, instead of `Hello world` 
you should see `My test value`.

### Use case
It's helpful when you need to run several variants of your app and some parameters
needs to be passed on runtime.

It could be especially useful when mixed with docker, then you can do something like:

`docker run -p 3000:3000 -e MY_TEST_VAL="Foo bar" frontend:latest`

Thanks this you don't need to rebuild whole docker image with app to change your application behaviour 

Example Dockerfile for above example

```dockerfile
FROM node:12
ENV MY_TEST_VAL ''
COPY . /app/
WORKDIR /app
RUN npm install
RUN npm install -g env-serve
RUN npm run build
EXPOSE 3000
WORKDIR /app/build
CMD ["env-serve"]
``` 

### Known problems
- I can't quit from my docker when env-serve is set to entrypoint - add `--init` flag to your `docker run` it prevents env-serve process from stealing PID 1 and helps with proper signal handling  

Help output:
```text
Usage: env-serve [options]

Options:
  -V, --version                   output the version number
  -v, --version                   output the version number
  -g, --global [globalName]       global variable name eg. window.yourName (default: "appConfig")
  -c, --cert [pathToCert]         path to cert file
  -C, --ca [pathToCa]             path to ca file
  -S, --https [pathToCa]          is https mode (default: false)
  -k, --cert-key [pathToCertKey]  path to cert key file
  -p, --port [port]               port (default: 3000)
  -f, --config-file [configFile]  file where config exists (default: "index.html")
  -s, --self-signed [selfSigned]  generate self signed certificate for server
  -h, --help                      output usage information
```
