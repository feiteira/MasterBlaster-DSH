# dsh-remote-settings

Host-only profile plugin for this deployment.

Settings RPCs stay loopback-pinned in upstream DSH because `trustedHosts` is a
DNS-rebinding fence, not authentication. Here the GUI is reached only through
`https://dev.thehumanloop.eu` with HTTP basic auth, and nginx rewrites
`Host`/`Origin` to `127.0.0.1:3080`, so the server already accepts privileged
settings calls. The browser still sees hostname `dev.thehumanloop.eu` and
refuses to *ask*.

On 0.1.1 the host plugin can overlay `/plugins/<id>/client.js`. On 0.1.2 the
shell loads combo `/plugins/??id1,id2&rev=...` URLs, so the overlay never
runs; `lib/patch-files.js` must rewrite the installed bundles on disk
(root, during upgrade) before `dsh-web` starts:

```sh
node lib/patch-files.js --dsh /opt/node/lib/node_modules/@deepseek-ai/dsh \
  --host dev.thehumanloop.eu
```

Patched packages:

- `@deepseek-ai/dsh-client-ui-settings` (0.1.1 and 0.1.2)
- `@deepseek-ai/dsh-client-ui-settings-general` (0.1.2 document actions)

It does not:

- open settings on an arbitrary remote origin
- set `connection.isLoopback` (native desktop actions stay local)
- change the server-side privileged-method list

On 0.1.2+, `dsh web` requires a one-time `?token=` exchange (cookie is
authority-bound and lasts 30 days). After boot this plugin writes that URL to
`$DSH_HOME/web-launch.url` using `publicOrigin`. Open that URL once through
the reverse proxy; do not paste the token into chat logs.
