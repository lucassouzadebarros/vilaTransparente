FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre

WORKDIR /app
COPY --from=build /app/target/portal-vila-api-0.1.0.jar /app/app.jar
COPY scripts/render-start.sh /app/render-start.sh
RUN chmod +x /app/render-start.sh && mkdir -p /data/uploads

ENV PORT=8080
ENV PORTAL_UPLOAD_DIR=/data/uploads

EXPOSE 8080
CMD ["/app/render-start.sh"]
