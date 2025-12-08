export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
    private log(level: LogLevel, message: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

        switch (level) {
            case 'debug':
                if (process.env.NODE_ENV === 'development') {
                    console.debug(prefix, message, ...args);
                }
                break;
            case 'info':
                console.log(prefix, message, ...args);
                break;
            case 'warn':
                console.warn(prefix, message, ...args);
                break;
            case 'error':
                console.error(prefix, message, ...args);
                break;
        }
    }

    debug(message: string, ...args: any[]) {
        this.log('debug', message, ...args);
    }

    info(message: string, ...args: any[]) {
        this.log('info', message, ...args);
    }

    warn(message: string, ...args: any[]) {
        this.log('warn', message, ...args);
    }

    error(message: string, ...args: any[]) {
        this.log('error', message, ...args);
    }
}

export const logger = new Logger();
