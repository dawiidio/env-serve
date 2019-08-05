# env-serve

HTTP(S) server for static files with dynamic config from env vars

usage:

```bash
npm i -g env-serve

# for help
env-serve --help

# run simple server
env-serve -p 3003 -f index.html

# run https server with selfsigned certs
env-serve -s -p 3003 -f index.html

# run server and change values, values from env variables will be written to config in index.html

EXPORT MY_TEST_VAL="My test value"; env-serve -f index.html
```

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
