/*
    SPDX-License-Identifier: Apache-2.0
*/
var helper = require('../../../common/helper');
var logger = helper.getLogger('FabricEvent');

class FabricEvent {
  constructor(client, fabricServices) {
    this.client = client;
    this.fabricServices = fabricServices;
    this.peerEventHub = {};
    this.channelEventHubs = new Map();
  }

  async initialize() {
    // creating peer level event hub to capture new channel
    this.createPeerEventHub();
    logger.debug(
      'Successfully created peer event hub for client [%s]',
      this.client.client_name
    );
    // creating channel event hub
    let channels = this.client.getChannels();
    for (var [channel_name, channel] of channels.entries()) {
      this.createChannelEventHub(channel);
      logger.debug(
        'Successfully created channel event hub for  [%s]',
        channel_name
      );
    }
  }

  createPeerEventHub() {
    // Creating peer EventHubs
    this.peerEventHub = this.client.hfc_client.getEventHub(
      this.client.defaultPeer.getName()
    );
    this.peerEventHub.registerBlockEvent(
      async block => {
        // process only first block for creating new channel in client
        if (block.header.number === '0' || block.header.number == 0) {
          await this.fabricServices.processBlockEvent(this.client, block);
        }
      },
      err => {
        logger.error('Block Event %s', err);
      }
    );
    this.connectPeerEventHub();
  }

  connectPeerEventHub() {
    let _self = this;
    if (this.peerEventHub) {
      this.peerEventHub.connect();
      // wait 5 sec to process blocks
      setTimeout(function () {
        _self.synchBlocks();
      }, 5000);
    } else {
      // if peer event hub is not defined then create new peer event hub
      this.createPeerEventHub();
      return false;
    }
  }

  isPeerEventHubConnected() {
    if (this.peerEventHub) {
      return this.peerEventHub.isconnected();
    } else {
      return false;
    }
  }

  createChannelEventHub(channel) {
    // create channel event hub
    let eventHub = channel.newChannelEventHub(this.client.defaultPeer);
    eventHub.registerBlockEvent(
      async block => {
        // skip first block, it is process by peer event hub
        if (!(block.header.number === '0' || block.header.number == 0)) {
          await this.fabricServices.processBlockEvent(this.client, block);
        }
      },
      err => {
        logger.error('Block Event %s', err);
      }
    );
    this.connectChannelEventHub(channel.getName(), eventHub);
    // set channel event hub to map
    this.channelEventHubs.set(channel.getName(), eventHub);
  }

  connectChannelEventHub(channel_name, eventHub) {
    let _self = this;
    if (eventHub) {
      eventHub.connect(true);
      setTimeout(
        function (channel_name) {
          _self.synchChannelBlocks(channel_name);
        },
        5000,
        channel_name
      );
    } else {
      // if channel event hub is not defined then create new channel event hub
      let channel = this.client.hfc_client.getChannel(channel_name);
      this.createChannelEventHub(channel);
      return false;
    }
  }

  isChannelEventHubConnected(channel_name) {
    let eventHub = this.channelEventHubs.get(channel_name);
    if (eventHub) {
      return eventHub.isconnected();
    } else {
      return false;
    }
  }

  disconnectChannelEventHub(channel_name) {
    let eventHub = this.channelEventHubs.get(channel_name);
    return eventHub.disconnec();
  }

  disconnectEventHubs() {
    // disconnect all event hubs
    for (var [channel_name, eventHub] of this.channelEventHubs.entries()) {
      let status = this.isChannelEventHubConnected();
      if (status) {
        this.disconnectChannelEventHub(channel_name);
      }
    }
    if (this.peerEventHub) {
      this.peerEventHub.disconnect();
    }
  }
  // channel event hub used to synch the blocks
  async synchChannelBlocks(channel_name) {
    if (this.isChannelEventHubConnected(channel_name)) {
      let channel = this.client.hfc_client.getChannel(channel_name);
      await this.fabricServices.synchBlocks(this.client, channel);
    }
  }
  // Interval and peer event hub used to synch the blocks
  async synchBlocks() {
    if (!this.isPeerEventHubConnected()) {
      this.connectPeerEventHub();
    }
    // getting all channels list from client ledger
    let channels = await this.client
      .getHFC_Client()
      .queryChannels(this.client.getDefaultPeer().getName(), true);

    for (let channel of channels.channels) {
      let channel_name = channel.channel_id;
      if (!this.client.getChannels().get(channel_name)) {
        // initialize channel, if it is not exists in the client context
        await this.client.initializeNewChannel(channel_name);
        await this.fabricServices.synchNetworkConfigToDB(this.client);
      }
    }
    for (let channel of channels.channels) {
      let channel_name = channel.channel_id;
      // check channel event is connected
      if (this.isChannelEventHubConnected(channel_name)) {
        // call synch blocks
        let channel = this.client.hfc_client.getChannel(channel_name);
        await this.fabricServices.synchBlocks(this.client, channel);
      } else {
        let eventHub = this.channelEventHubs.get(channel_name);
        if (eventHub) {
          // connect channel event hub
          this.connectChannelEventHub(channel_name, eventHub);
        } else {
          let channel = this.client.getChannels().get(channel_name);
          if (channel) {
            // create channel event hub
            this.createChannelEventHub(channel);
          } else {
            // initialize channel, if it is not exists in the client context
            await this.client.initializeNewChannel(this, channel_name);
            await this.fabricServices.synchNetworkConfigToDB(this.client);
          }
        }
      }
    }
  }
}

module.exports = FabricEvent;
