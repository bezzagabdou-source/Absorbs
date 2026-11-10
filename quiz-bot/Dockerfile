# برق — بوت مسابقات + لوحة تحكم (بلا أي اعتمادية خارجية)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# بيانات دائمة (SQLite + الصور): اربط مجلداً خارجياً على /app/data
RUN mkdir -p /app/data/uploads /app/data/avatars
VOLUME ["/app/data"]

ENV HOST=0.0.0.0 PORT=8080 DB_PATH=/app/data/barq.db
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
