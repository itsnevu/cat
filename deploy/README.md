# Deploying SPHYNX to production

Server: `37.60.232.191` (root, **shared** box). The app lives at `/var/www/sphynx`, runs under PM2 on :5190, and is fronted by **Caddy**, which already owns :80/:443 on this server and issues/renews HTTPS certificates automatically.

> Do **not** run Nginx or certbot on this server — Caddy holds the ports. `server-setup.sh` is kept only for a fresh, dedicated Ubuntu box.

## 0. One-time: install your SSH key (done)

```bash
[ -f ~/.ssh/id_ed25519.pub ] || ssh-keygen -t ed25519 -C "sphynx-deploy" -f ~/.ssh/id_ed25519 -N ""
ssh-copy-id root@37.60.232.191
ssh root@37.60.232.191 echo OK
```

Then rotate the root password (it was pasted in chat) and consider disabling password login:
```bash
ssh root@37.60.232.191 'passwd && sed -i "s/^#\?PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config && systemctl reload ssh'
```

## 1. Deploy — and every update after this

Node 20 + PM2 already exist on the server.

```bash
./deploy/deploy.sh          # rsync → npm ci → next build → pm2 reload → health check
./deploy/deploy.sh --fast   # skip npm ci when dependencies didn't change
```

## 2. One-time: route the domain through Caddy (auto-HTTPS)

DNS A records for `sphynxagent.xyz` and `www` already point at the server. Append the site to the Caddyfile once:

```bash
ssh root@37.60.232.191
cat >> /etc/caddy/Caddyfile <<'EOF'

sphynxagent.xyz {
    reverse_proxy 127.0.0.1:5190
    encode zstd gzip
}
www.sphynxagent.xyz {
    redir https://sphynxagent.xyz{uri} permanent
}
EOF
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
curl -sI https://sphynxagent.xyz | head -1     # expect HTTP/2 200 after a few seconds
```

## Useful

```bash
ssh root@37.60.232.191 pm2 logs sphynx --lines 100
ssh root@37.60.232.191 pm2 restart sphynx
ssh root@37.60.232.191 journalctl -u caddy -n 50
```

Env: if you get a private RPC endpoint, set `RPC_URL` in `/var/www/sphynx/.env.production` (see `lib/chain.ts`).
