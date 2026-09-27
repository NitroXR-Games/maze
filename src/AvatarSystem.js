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
    this.player.entity.update({
      model: avatar.model,
      color: avatar.color
    });
    console.log(`Avatar changed to ${avatar.id}`);
  }

  getCurrentAvatar() {
    return this.avatars[this.currentIndex];
  }
}
