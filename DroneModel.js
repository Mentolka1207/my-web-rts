import * as THREE from 'three';

/**
 * Процедурный генератор 3D-модели квадрокоптера
 * @param {number} color - Цвет фракции (игрока) в формате 0xHEX
 */
export function createDroneUnit(color = 0x3b82f6) {
    const droneGroup = new THREE.Group();

    // Материалы
    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.8,
        roughness: 0.2
    });
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937, // Углеволокно (карбон)
        metalness: 0.9,
        roughness: 0.1
    });
    const rotorMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b, // Пропеллеры
        metalness: 0.3,
        roughness: 0.5
    });
    const ledMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc // Сигнальный огонь
    });

    // 1. Корпус
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.15, 0.5);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.1;
    droneGroup.add(body);

    // 2. Направленный светодиод (передняя часть)
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.08, 0.08);
    const eye = new THREE.Mesh(eyeGeo, ledMat);
    eye.position.set(0, 0.1, 0.26);
    droneGroup.add(eye);

    // 3. Диагональные балки рамы
    const armGeo = new THREE.BoxGeometry(0.08, 0.04, 0.9);
    
    const arm1 = new THREE.Mesh(armGeo, frameMat);
    arm1.position.y = 0.1;
    arm1.rotation.y = Math.PI / 4;
    droneGroup.add(arm1);

    const arm2 = new THREE.Mesh(armGeo, frameMat);
    arm2.position.y = 0.1;
    arm2.rotation.y = -Math.PI / 4;
    droneGroup.add(arm2);

    // 4. Двигатели и лопасти
    const rotors = [];
    const distance = 0.32;
    const rotorPositions = [
        { x: distance, z: distance },
        { x: -distance, z: distance },
        { x: distance, z: -distance },
        { x: -distance, z: -distance }
    ];

    rotorPositions.forEach((pos, index) => {
        // Статор мотора
        const motorGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8);
        const motor = new THREE.Mesh(motorGeo, frameMat);
        motor.position.set(pos.x, 0.14, pos.z);
        droneGroup.add(motor);

        // Винт
        const bladeGeo = new THREE.BoxGeometry(0.35, 0.01, 0.03);
        const blade = new THREE.Mesh(bladeGeo, rotorMat);
        blade.position.set(pos.x, 0.18, pos.z);
        blade.rotation.y = Math.random() * Math.PI;

        droneGroup.add(blade);
        rotors.push(blade);
    });

    // Сохраняем ссылки для последующей анимации
    droneGroup.userData = {
        rotors: rotors,
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3(0, 0, 0) // Будем обновлять при движении по Flow Field
    };

    droneGroup.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return droneGroup;
}
