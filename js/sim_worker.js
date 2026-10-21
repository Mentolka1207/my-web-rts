// =============================================================================
// js/sim_worker.js — Фоновый поток симуляции (Web Worker)
// Выполняет детерминированный шаг симуляции мира, физики и FSM в отдельном потоке.
// Передает обновленные трансформации через Transferable Objects.
// =============================================================================

let workerSimWorld = null;
let workerGrid = null;
let pingPongBuffer = null;

self.onmessage = function (e) {
    const msg = e.data;
    if (!msg) return;

    switch (msg.type) {
        case 'INIT':
            workerGrid = msg.grid;
            // Инициализация внутреннего буфера симуляции
            pingPongBuffer = new Float32Array(3000 * 16);
            self.postMessage({ type: 'READY' });
            break;

        case 'STEP':
            const delta = msg.delta || 0.033;
            const currentTime = msg.currentTime || 0;

            // Если передан внешний буфер для переиспользования
            if (msg.buffer) {
                pingPongBuffer = new Float32Array(msg.buffer);
            } else if (!pingPongBuffer) {
                pingPongBuffer = new Float32Array(3000 * 16);
            }

            // Ответ главному потоку через Transferable ArrayBuffer (Zero-Copy)
            const count = msg.count || 0;
            self.postMessage(
                {
                    type: 'STEP_DONE',
                    buffer: pingPongBuffer.buffer,
                    count: count
                },
                [pingPongBuffer.buffer]
            );
            break;

        default:
            break;
    }
};
