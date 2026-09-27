# Asset Integration Guide: Maze XR

Since NitroXR utilizes a **Cloud-Native Asset Model**, you do not bundle 3D files in the code. Instead, you link to assets in the NitroXR Cloud Library or upload custom ones to the Dashboard.

## 1. Required Asset Map
To transform the current "Primitive" prototype into a high-fidelity experience, the following assets should be linked/created:

### A. Environment (The Body)
| Element | Suggested Material/Model | NitroXR Material Type | Note |
| :--- | :--- | :--- | :--- |
| **Walls** | `nitro_concrete_wall` $\to$ `custom_sci_fi_wall` | PBR Material | Should have a seamless tiling texture. |
| **Floor** | `nitro_gray_floor` $\to$ `custom_grid_floor` | PBR Material | Dark base with emissive grid lines for a "Tron" vibe. |
| **Goal** | `nitro_gold_glow` $\to$ `custom_victory_portal` | Emissive Model | A rotating torus or portal with a glow effect. |

### B. Entities (The Actors)
| Entity | Suggested Model | Format | Note |
| :--- | :--- | :--- | :--- |
| **Player** | `sphere` $\to$ `custom_xr_avatar` | GLB/GLTF | A low-poly character or a floating drone. |
| **Sentinels**| `sphere` $\to$ `custom_security_bot` | GLB/GLTF | A floating eye or a robotic spider. |

---

## 2. Supported Formats
NitroXR is optimized for the web and XR headsets. Use the following formats for the best performance:

### 3D Models: **GLB / GLTF**
- **Why**: The industry standard for XR. It packs geometry, materials, and animations into a single binary file.
- **Constraint**: Keep poly-counts low to maintain the 60fps target.

### Textures: **PNG / JPG / WebP**
- **Why**: Standard PBR (Physically Based Rendering) maps.
- **Maps needed**: Albedo (Color), Normal (Bumps), Roughness, and Metallic.

### Icons/UI: **SVG**
- **Why**: SVGs are resolution-independent and perfect for the HUD.
- **Usage**: Use SVGs for the "Step Counter" icon and "Timer" clock to keep them crisp on high-res VR lenses.

---

## 3. Implementation Workflow
1. **Upload**: Upload your `.glb` models and textures to the **NitroXR Asset Dashboard**.
2. **Assign ID**: The dashboard will provide a unique **Material ID** or **Model ID** (e.g., `custom_sci_fi_wall`).
3. **Update Code**: Replace the primitive pointers in `MazeEngine.js` and `Player.js` with these IDs:
   ```javascript
   // Example update
   this.scene.createEntity('wall', {
     model: 'custom_wall_model',
     material: 'custom_sci_fi_wall'
   });
   ```
4. **Deploy**: Push the code $\to$ The NitroXR Runtime fetches the assets automatically.
