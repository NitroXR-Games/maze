export class AvatarSystem {
  constructor(player) {
    this.player = player;
    this.avatars = [
      { id: 'classic', model: 'sphere', color: 'blue' },
      { id: 'cube', model: 'cube', color: 'orange' },
      { id: 'pyramid', model: 'pyramid', color: 'purple' }
    ];
    this.currentIndex = 0;
  }

  cycleAvatar() {
    this.currentIndex = (this.currentIndex + 1) % this.avatars.length;
    const avatar = this.avatars[this.currentIndex];
    // Live entities swap visuals through the mesh: tint what has a color.
    // Full model swaps need a re-created entity (backlog).
    try {
      this.player.entity?.mesh?.traverse?.((o) => {
        if (o.material && o.material.color) o.material.color.set(avatar.color);
      });
    } catch {
      // Headless or fallback primitive: cosmetic only.
    }
    console.log(`Avatar changed to ${avatar.id}`);
  }

  getCurrentAvatar() {
    return this.avatars[this.currentIndex];
  }
}
