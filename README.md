# retro-nag-bot
A Matrix bot that complains when people don't do their retro actions

## Docker (preferred)

Build with `docker build -t retro-nag-bot .`.

```bash
git clone https://github.com/vector-im/retro-nag-bot.git
cd retro-nag-bot

# Build it
docker build -t retro-nag-bot .

# Copy and edit the config. It is not recommended to change the data path.
mkdir -p /etc/retro-nag-bot
cp config/default.yaml /etc/retro-nag-bot/production.yaml
nano /etc/retro-nag-bot/production.yaml

# Run it
docker run --rm -it -v /etc/retro-nag-bot:/data retro-nag-bot:latest
```

## Build it

This bot requires `yarn` and Node 10.

```bash
git clone https://github.com/vector-im/retro-nag-bot.git
cd mjolnir

yarn install
yarn build

# Copy and edit the config. It *is* recommended to change the data path.
cp config/default.yaml config/development.yaml
nano config/development.yaml

node lib/index.js
```

## Development

TODO. It's a TypeScript project with a linter.
