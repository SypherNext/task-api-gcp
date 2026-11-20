FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY app.mjs server.mjs postgres.mjs ./
USER node
ENV PORT=8080 BIND_HOST=0.0.0.0
EXPOSE 8080
CMD ["node", "server.mjs"]
