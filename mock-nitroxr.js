/**
 * NitroXR Mock Environment
 * This allows testing the game logic in a standard browser/Node environment
 * by simulating the NitroXR Scene, Entities, and Cloud APIs.
 */

globalThis.NitroXR = {
  Scene: class {
    constructor() {
      this.entities = {};
      console.log("🌐 NitroXR Scene Initialized");
    }
    createEntity(id, props) {
      const entity = {
        id,
        ...props,
        setPosition: (pos) => {
          entity.position = pos;
          // console.log(`Entity ${id} moved to ${pos}`);
        },
        update: (props) => {
          Object.assign(entity, props);
          console.log(`Entity ${id} updated:`, props);
        },
        setText: (text) => {
          entity.text = text;
          // console.log(`Entity ${id} text: ${text}`);
        }
      };
      this.entities[id] = entity;
      return entity;
    }
    getEntity(id) {
      return this.entities[id];
    }
    removeEntity(id) {
      delete this.entities[id];
      console.log(`Entity ${id} removed`);
    }
    clear() {
      this.entities = {};
      console.log("🧹 Scene Cleared");
    }
    render() {
      // Mock render
    }
  },
  Cloud: {
    submit: async (data) => {
      console.log("☁️ Cloud Submit:", data);
      return { success: true };
    },
    getGhost: async (userId) => {
      console.log(`☁️ Fetching ghost for ${userId}...`);
      return {
        path: [{ x: 1, z: 1, t: 0 }, { x: 2, z: 1, t: 1000 }, { x: 2, z: 2, t: 2000 }]
      };
    },
    getTop: async (count) => {
      return [{ userId: 'pro_player_1', score: 100 }];
    },
    submitGhost: async (data) => {
      console.log("☁️ Ghost Submitted:", data.userId);
      return { success: true };
    }
  },
  User: {
    id: 'test_user_123'
  },
  onUpdate: (callback) => {
    console.log("🚀 NitroXR Runtime Started. Simulation running...");
    setInterval(() => {
      // Simulate a player moving forward
      callback({
        forward: true,
        backward: false,
        left: false,
        right: false,
        changeAvatar: Math.random() > 0.99,
        toggleEditor: false,
        interact: false
      });
    }, 100);
  }
};
