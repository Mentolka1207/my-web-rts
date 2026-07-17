import { createDroneUnit, createLaserFX } from './DroneModel.js';

export class Unit {
    constructor(x, z, playerColor, scene) {
        this.scene = scene;
        this.playerColor = playerColor;
        
        // 1. Спавним дрон вместо коробки
        this.mesh = createDroneUnit(playerColor);
        this.mesh.position.set(x, 0.5, z); // Поднимаем чуть выше земли
        this.scene.add(this.mesh);

        // Физика и логика Flow Field
        this.position = this.mesh.position;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.speed = 0.08;

        // FSM параметры боя
        this.state = 'IDLE'; // IDLE, MOVE, ATTACK
        this.target = null;
        this.attackRange = 4.0;
        this.lastAttackTime = 0;
        this.attackCooldown = 800; // мс
    }

    // Твой метод логики FSM-атаки
    update(time, enemies) {
        // ... твоя логика поиска ближайшей цели и движения к ней ...

        if (this.state === 'ATTACK' && this.target) {
            const dist = this.position.distanceTo(this.target.position);
            
            if (dist <= this.attackRange) {
                // Останавливаем дрон во время стрельбы
                this.velocity.set(0, 0, 0);
                
                // Таймер перезарядки выстрела
                const now = performance.now();
                if (now - this.lastAttackTime > this.attackCooldown) {
                    this.shootLaser();
                    this.lastAttackTime = now;
                }
            } else {
                this.state = 'MOVE'; // Если цель убежала — летим за ней
            }
        }
    }

    // НОВОЕ: Отрисовка лазерного выстрела
    shootLaser() {
        if (!this.target) return;

        // Позиция "глаза" дрона (откуда вылетает лазер)
        const startPos = new THREE.Vector3()
            .copy(this.position)
            .add(new THREE.Vector3(0, 0.15, 0.2)); // Смещение к переднему светодиоду
            
        // Позиция цели
        const endPos = new THREE.Vector3().copy(this.target.position);

        // Создаем лазерный луч (для игрока зеленый/бирюзовый, для врагов — красный)
        const laserColor = this.playerColor === 0x3b82f6 ? 0x00ffcc : 0xff3333;
        createLaserFX(this.scene, startPos, endPos, laserColor);

        // Наносим урон цели (в рамках твоей боевой системы)
        if (typeof this.target.takeDamage === 'function') {
            this.target.takeDamage(10);
        }
    }
}
