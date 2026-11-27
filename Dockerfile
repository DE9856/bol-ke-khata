# Stage 1: build the React front end
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# Stage 2: small runtime with only the server and the built files
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server ./server
COPY src/lib ./src/lib
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server/index.js"]
