FROM node:22-bookworm-slim

# ffmpeg: marca de agua en videos · fuentes: texto de la marca de agua en fotos
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    DATA_DIR=/var/data
# Render inyecta PORT; el servidor lo lee de la variable de entorno.
EXPOSE 10000
CMD ["node", "server.js"]
