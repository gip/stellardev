FROM node:22.12-alpine AS builder

WORKDIR /app

COPY . /app

RUN --mount=type=cache,target=/root/.npm npm install
RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

# Install dependencies
RUN apk add --no-cache curl bash build-base openssl-dev

# Install Rust (and load env in same layer)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | bash -s -- -y && \
    export PATH="/root/.cargo/bin:$PATH" && \
    rustup default stable && \
    rustup target add wasm32-unknown-unknown && \
    cargo install --locked stellar-cli@22.7.0 --features opt

# Set PATH for future layers
ENV PATH="/root/.cargo/bin:${PATH}"
# Use bash for subsequent RUN steps (optional now since rustup is configured)
SHELL ["/bin/bash", "-c"]

FROM node:22-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# ✅ Copy Rust toolchain and binaries
COPY --from=builder /root/.cargo /root/.cargo
COPY --from=builder /root/.rustup /root/.rustup

# ✅ Make cargo available in PATH
ENV PATH="/root/.cargo/bin:$PATH"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

ENV NODE_ENV=production

RUN npm ci --ignore-scripts --omit-dev

ENTRYPOINT ["node", "/app/dist/index.js"]