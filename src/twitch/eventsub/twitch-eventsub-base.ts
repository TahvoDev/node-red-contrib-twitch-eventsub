export class BaseTwitchEventsubNode {
  node: any;
  twitchConfig: any;
  subscriptionType: string = '';
  private nodeUuid: string;

  constructor(RED: any, config: any) {
    this.node = this as any;
    this.nodeUuid = config.id;
    RED.nodes.createNode(this.node, config);

    this.twitchConfig = RED.nodes.getNode(config.config);
    if (!this.twitchConfig) {
      this.node.error('No Twitch API Config node configured');
      return;
    }

    this.node.on('close', (removed: boolean, done: () => void) => {
      if (this.twitchConfig) {
        this.twitchConfig.removeNode(this.nodeUuid, this.subscriptionType, done);
      } else {
        done();
      }
    });
  }

  protected register(subscriptionType: string) {
    this.subscriptionType = subscriptionType;
    this.twitchConfig?.addNode(this.nodeUuid, this.node, this.subscriptionType);
  }

  triggerTwitchEvent(event: any, subscriptionType: string) {
    if (subscriptionType === this.subscriptionType) {
      this.node.send({ payload: this.mapEvent(event) });
    }
  }

  mapEvent(event: any): any {
    return event;
  }
}
