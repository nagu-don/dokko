import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const baseOptions = {
  level: LOG_LEVEL,
};

const options = IS_PRODUCTION
  ? baseOptions
  : {
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    };

const logger = pino(options);

export default logger;