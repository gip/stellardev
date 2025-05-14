# Base image for Rust toolchain
FROM node:22.12-alpine AS rust-base

# Install dependencies
RUN apk add --no-cache bash curl gcc g++ make musl-dev openssl-dev

# Install Rust (in its own layer for better caching)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | bash -s -- -y && \
    export PATH="/root/.cargo/bin:$PATH" && \
    rustup default stable && \
    rustup target add wasm32-unknown-unknown

# Install Stellar CLI (in its own layer)
RUN export PATH="/root/.cargo/bin:$PATH" && \
    cargo install --locked stellar-cli@22.7.0 --features opt

# Set PATH for future layers
ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

# Builder stage that uses the Rust base
FROM rust-base AS builder

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies with caching
RUN --mount=type=cache,target=/root/.npm npm install
RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

# Only after dependencies are installed, copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Release stage
FROM node:22-alpine AS release

WORKDIR /app

# Copy the entire musl toolchain (safer)
COPY --from=builder /usr /usr
COPY --from=builder /lib /lib

# Copy only what's needed from the builder stage
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Copy Rust toolchain and binaries from the rust-base stage
COPY --from=rust-base /root/.cargo /root/.cargo
COPY --from=rust-base /root/.rustup /root/.rustup

# Set environment variables
ENV PATH="/root/.cargo/bin:$PATH"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"
ENV NODE_ENV=production

# Install production dependencies
RUN npm ci --ignore-scripts --omit-dev

ENTRYPOINT ["node", "/app/dist/index.js", "--http"]