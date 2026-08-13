FROM node:20-slim

WORKDIR /app

# Cài đặt ffmpeg để hỗ trợ xử lý và phát âm thanh
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production
COPY index.js ./

EXPOSE 8080
CMD ["node", "index.js"]
