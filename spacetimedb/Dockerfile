FROM docker.io/clockworklabs/spacetime:v2.0.5 AS cli

FROM node:22-slim

# Copy spacetime CLI from the official image
COPY --from=cli /opt/spacetime/ /opt/spacetime/
RUN ln -s /opt/spacetime/spacetimedb-cli /usr/local/bin/spacetime

WORKDIR /module

# Install dependencies
COPY spacetimedb/package.json spacetimedb/package-lock.json ./
RUN npm ci

# Copy module source and config
COPY spacetimedb/tsconfig.json ./
COPY spacetimedb/src/ ./src/

# Copy publish script
COPY spacetimedb/publish.sh /publish.sh
RUN chmod +x /publish.sh

CMD ["/publish.sh"]
