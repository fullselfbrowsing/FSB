import { createConnection } from 'node:net';

const socketPath = process.argv[2];
if (!socketPath) { console.error('A task controller socket is required'); process.exit(2); }
const socket = createConnection(socketPath);
socket.on('connect', () => { process.stdin.pipe(socket); socket.pipe(process.stdout); });
socket.on('error', err => { console.error(err.message); process.exitCode = 1; socket.destroy(); process.stdin.destroy(); });
socket.on('close', () => process.stdin.destroy());
process.stdout.on('error', () => { socket.destroy(); process.exit(0); });
process.once('SIGTERM', () => { socket.destroy(); process.exit(0); });
