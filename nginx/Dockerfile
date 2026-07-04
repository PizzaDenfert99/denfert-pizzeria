# Custom nginx image — adds openssl (for self-signed placeholder certs on
# first boot) + a small entrypoint that generates missing certs before
# handing off to the standard nginx entrypoint.
#
# The image is otherwise identical to `nginx:1.27-alpine`.

FROM nginx:1.27-alpine

# `openssl` is not in the base image — we need it to auto-generate self-signed
# placeholders so the container can start on a fresh VPS before real Let's
# Encrypt certs are in place.
RUN apk add --no-cache openssl

# ACME HTTP-01 webroot — shared with certbot so renewals don't need downtime.
RUN mkdir -p /var/www/certbot

COPY docker-entrypoint-init.sh /docker-entrypoint-init.sh
RUN chmod +x /docker-entrypoint-init.sh

ENTRYPOINT ["/docker-entrypoint-init.sh"]
CMD ["nginx", "-g", "daemon off;"]
