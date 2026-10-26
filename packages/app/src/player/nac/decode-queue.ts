/**
 * 跳转只改变下一块的优先级；后台没有播放时钟或背压，始终继续解码。
 * 优先从目标向后解码，到结尾后再补齐前面的空洞。
 */
export class DecodeQueue {
  private readonly done: Uint8Array;
  private cursor = 0;
  private priority: number | null = null;
  completed = 0;

  constructor(readonly blocks: number) {
    this.done = new Uint8Array(blocks);
  }

  request(block: number): void {
    if (!Number.isInteger(block) || block < 0 || block >= this.blocks) return;
    if (!this.done[block]) this.priority = block;
  }

  next(): number | null {
    if (this.priority !== null) {
      this.cursor = this.priority;
      this.priority = null;
    }
    for (let count = 0; count < this.blocks; count++) {
      const block = (this.cursor + count) % this.blocks;
      if (!this.done[block]) return block;
    }
    return null;
  }

  finish(block: number): void {
    if (!this.done[block]) {
      this.done[block] = 1;
      this.completed++;
    }
    this.cursor = (block + 1) % this.blocks;
  }
}
