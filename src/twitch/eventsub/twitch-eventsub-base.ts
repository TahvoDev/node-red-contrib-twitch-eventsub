// Use CommonJS require so Node-RED can load it
const { randomUUID } = require('crypto');

class BaseTwitchEventsubNode {
  node: any;
  id: string; 
  twitchConfig: any;

  constructor(RED: any, config: any) {
    this.node = this as any;
    RED.nodes.createNode(this.node, config);

    this.id = randomUUID();
    this.twitchConfig = RED.nodes.getNode(config.config);

    if (this.twitchConfig) {
      this.twitchConfig.addNode(this.id, this.node);

      this.node.on('close', (removed: boolean, done: () => void) => {
        if (removed) {
          this.twitchConfig.removeNode(this.id, done);
        } else {
          done();
        }
      });
    } else {
      this.node.error('No Twitch API Config node configured');
    }
  }

  // Send the mapped event data depending on the subcription type
  triggerTwitchEvent(event: any, subscriptionType: string) {
    if (subscriptionType === this.subscriptionType) {
      const mapped = this.mapEvent(event);
      this.node.send({ payload: mapped });
    }
  }

  // Subclasses to map event data to payload
  mapEvent(event: any): any {
    return event;
  }

  // Subclasses determine subscription type
  get subscriptionType(): string {
    return '';
  }
}