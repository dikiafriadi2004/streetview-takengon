FROM node:20-alpine

WORKDIR /app

# Install system dependencies for sharp and argon2
RUN apk add --no-cache python3 make g++ vips-dev

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api --production=false

# Copy source and build
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
RUN npm run build --workspace=apps/api

# Production install
RUN npm ci --workspace=apps/api --production

CMD ["node", "apps/api/dist/index.js"]
