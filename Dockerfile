# Build:                   sudo docker build --no-cache . -t cacophony-api
# Run interactive session: sudo docker run -it cacophony-api

FROM ubuntu:18.04

RUN apt-get update
RUN apt-get install -y apt-utils

RUN apt-get install -y tzdata
RUN echo "Pacific/Auckland" > /etc/timezone
RUN ln -sf /usr/share/zoneinfo/Pacific/Auckland /etc/localtime
RUN apt-get update --fix-missing
RUN apt-get -y install curl sudo make build-essential g++

RUN apt-get -y install postgis postgresql-server-dev-10
RUN echo "listen_addresses = '*'" >> /etc/postgresql/10/main/postgresql.conf
RUN echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/10/main/pg_hba.conf
RUN echo "host all all ::/0 md5" >> /etc/postgresql/10/main/pg_hba.conf

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

# https://minio.io/downloads.html#download-server-linux-x64
RUN curl --location --fail --silent --show-error --remote-name https://dl.minio.io/server/minio/release/linux-amd64/minio
RUN chmod +x minio

# https://docs.minio.io/docs/minio-client-complete-guide
RUN curl --location --fail --silent --show-error https://dl.minio.io/client/mc/release/linux-amd64/archive/mc.RELEASE.2019-07-11T19-31-28Z > mc
RUN chmod +x mc

COPY docker-entrypoint.sh /

# API
EXPOSE 1080

# API - fileProcessing
EXPOSE 2008

# Minio
EXPOSE 9001

# PostgreSQL
EXPOSE 5432

ENTRYPOINT ["/docker-entrypoint.sh"]
