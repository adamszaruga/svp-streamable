class LFGQueue {
    constructor() {
        this.queue = [];
    }

    addPlayer(player, time) {
        this.queue.push({
            name: player,
            schedule: time
        })
        this.pruneQueue(time)
    }

    clearQueue() {
        // This method should remove everyone from the queue
        this.queue = []
    }

    pruneQueue(time) {
        // This method should remove everyone who has been waiting more than 60 minutes before the prune time
        this.queue = this.queue.filter((x) => time < (x.schedule + 3600000))
    }

    announceQueue() {
        if (this.queue.length === 0) {
            return 'There is no one in the queue.';
        } else {
            let response = 'These people are currently online and ready to frag:\n'
            for (let i = 0; i < this.queue.length; i++) {
                response += this.queue[i].name + '\n'
            }
            return response;
        }
      
    }

}

module.exports = LFGQueue;