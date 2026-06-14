import { createScene } from './renderer/scene';

// Create the 3D scene
const sceneAPI = createScene(document.getElementById('app')!);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  sceneAPI.render();
}
animate();
