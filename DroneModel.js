import * as THREE from 'three';

// Создание 3D-модели дрона
export function createDroneUnit(color = 0x3b82f6) {
    const droneGroup = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.8,
        roughness: 0.2
    });
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.9,
        roughness: 0.1
    });
    const rotorMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.3,
        roughness: 0.5
    });
    const ledMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc
    });

    // 1. Корпус
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.12, 0.4);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.15;
    droneGroup.add(body);

    // 2. Светодиодный сенсор направления ("глаз")
    const eyeGeo = new THREE.BoxGeometry(0.15, 0.06, 0.06);
    const eye = new THREE.Mesh(eyeGeo, ledMat);
    eye.position.set(0, 0.15, 0.21);
    droneGroup.add(eye);

    // 3. Рама (лучи)
    const armGeo = new THREE.BoxGeometry(0.06, 0.03, 0.7);
    
    const arm1 = new THREE.Mesh(armGeo, frameMat);
    arm1.position.y = 0.15;
    arm1.rotation.y = Math.PI / 4;
    droneGroup.add(arm1);

    const arm2 = new THREE.Mesh(armGeo, frameMat);
    arm2.position.y = 0.15;
    arm2.rotation.y = -Math.PI / 4;
    droneGroup.add(arm2);

    // 4. Двигатели и лопасти
    const rotors = [];
    const distance = 0.25;
    const rotorPositions = [
        { x: distance, z: distance },
        { x: -distance, z: distance },
        { x: distance, z: -distance },
        { x: -distance, z: -distance }
    ];

    rotorPositions.forEach((pos, index) => {
        const motorGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8);
        const motor = new THREE.Mesh(motorGeo, frameMat);
        motor.position.set(pos.x, 0.18, pos.z);
        droneGroup.add(motor);

        const bladeGeo = new THREE.BoxGeometry(0.28, 0.01, 0.02);
        const blade = new THREE.Mesh(bladeGeo, rotorMat);
        blade.position.set(pos.x, 0.21, pos.z);
        blade.rotation.y = Math.random() * Math.PI;

        droneGroup.add(blade);
        rotors.push(blade);
    });

    // Настройки для анимации
    droneGroup.userData = {
        rotors: rotors,
        hoverOffset: Math.random() * 100,
        velocity: new THREE.Vector3()
    };

    droneGroup.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return droneGroup;
}

// Визуальный эффект выстрела лазером (создается на сцене на доли секунды)
export function createLaserFX(scene, startPos, endPos, color = 0x00ffcc) {
    const points = [startPos, endPos];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
        color: color,
        linewidth: 2, // На некоторых видеокартах толщина линий всегда 1px, это норма
        transparent: true,
        opacity: 1
    });
    
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Плавное растворение лазера
    const startTime = performance.now();
    const duration = 150; // миллисекунды действия лазера

    function fade() {
        const elapsed = performance.now() - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
            scene.remove(line);
            geometry.dispose();
            material.dispose();
        } else {
            material.opacity = 1 - progress;
            requestAnimationFrame(fade);
        }
    }
    fade();
}
