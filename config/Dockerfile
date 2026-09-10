FROM node:22-alpine

WORKDIR /opt/nms

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_URL=postgresql://postgres:postgres@postgres:5432/network_management_suite

EXPOSE 8080

CMD ["node", "server/server.js"]
