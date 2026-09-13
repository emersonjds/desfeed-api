FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --ignore-scripts
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
