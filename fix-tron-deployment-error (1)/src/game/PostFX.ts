import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CinematicShader } from './shaders';

export class PostFX {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  cine: ShaderPass;
  private renderPass: RenderPass;
  private output: OutputPass;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, samples: number) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), {
      type: THREE.HalfFloatType,
      samples,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(size.x, size.y);
    this.renderPass = new RenderPass(scene, camera);
    // Bloom в пол-разрешения: почти та же картинка, вдвое дешевле.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)), 0.5, 0.3, 0.82);
    this.cine = new ShaderPass(CinematicShader);
    this.cine.uniforms.uRes.value = new THREE.Vector2(size.x * pr, size.y * pr);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.cine);
    this.composer.addPass(this.output);
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.cine.uniforms.uRes.value = new THREE.Vector2(w * pr, h * pr);
  }

  setBloom(on: boolean, strength = 0.58) {
    this.bloom.enabled = on;
    this.bloom.strength = strength;
  }

  setCinematic(on: boolean) {
    this.cine.uniforms.uGrain.value = on ? 0.022 : 0;
    this.cine.uniforms.uChroma.value = on ? 0.0016 : 0;
    this.cine.uniforms.uVignette.value = on ? 0.55 : 0.3;
  }

  render(dt: number) {
    this.cine.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
  }
}
