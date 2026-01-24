import { randomUUID } from "crypto"; 

// 2. Export the class explicitly
export class BaseTwitchEventsubNode {
  node: any;
  twitchConfig: any;
  subscriptionType: string = "";

  constructor(RED: any, config: any) {
    this.node = this as any;
    RED.nodes.createNode(this.node, config);

    this.twitchConfig = RED.nodes.getNode(config.config);
    const nodeId = this.node.id;

    if (this.twitchConfig) {
      this.twitchConfig.addNode(nodeId, this.node);

      this.node.on('close', (removed: boolean, done: () => void) => {
        if (removed) {
          this.twitchConfig.removeNode(nodeId, done);
        } else {
          done();
        }
      });
    } else {
      this.node.error('No Twitch API Config node configured');
    }
  }

  triggerTwitchEvent(event: any, subscriptionType: string) {
    if (subscriptionType === this.subscriptionType) {
      const mapped = this.mapEvent(event);
      this.node.send({ payload: mapped });
    }
  }

  mapEvent(event: any): any {
    return event;
  }
}