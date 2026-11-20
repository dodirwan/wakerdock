FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5173

WORKDIR /app

COPY package.json server.mjs ./
COPY public ./public

# OpenShift ignores USER and runs the container as an arbitrary UID whose primary
# group is 0, so the writable state dir has to be group-owned by 0 and group-writable.
# USER 1001:0 below matches that model, so the same image also runs non-root on plain Docker.
RUN mkdir -p /app/data \
    && chgrp -R 0 /app \
    && chmod -R g=u /app

EXPOSE 5173

USER 1001:0

CMD ["node", "server.mjs"]
