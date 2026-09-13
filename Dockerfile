# # Dockerfile

# FROM node:20-slim

# RUN apt-get update && \
#     apt-get install -y python3 python3-pip ffmpeg curl && \
#     pip3 install yt-dlp==2026.8.19 --break-system-packages && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# RUN chmod +x entrypoint.sh

# EXPOSE 5000

# CMD ["./entrypoint.sh"]

# Dockerfile

FROM node:20-slim

RUN apt-get update && \
    apt-get install -y python3 python3-pip ffmpeg curl && \
    pip3 install "yt-dlp[default,curl-cffi]==2026.8.19" --break-system-packages && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 5000

CMD ["./entrypoint.sh"]