FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN npx tsc
RUN npm prune --omit=dev

EXPOSE 3001

CMD ["node", "dist/index.js"]
