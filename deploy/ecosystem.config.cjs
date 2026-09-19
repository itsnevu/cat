// PM2 process file — lives on the server at /var/www/sphynx
module.exports = {
  apps: [
    {
      name: "sphynx",
      cwd: "/var/www/sphynx",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 5190",
      env: { NODE_ENV: "production", PORT: "5190" },
      instances: 1,
      autorestart: true,
      max_memory_restart: "700M",
      time: true,
    },
  ],
};
