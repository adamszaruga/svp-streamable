require('dotenv').config()
const Eris = require('eris');
const axios = require('axios');
const bot = new Eris(process.env.DISCORD_BOT_TOKEN);   // Replace DISCORD_BOT_TOKEN in .env with your bot accounts token
const download = require('download-file')
const request = require('request');
const fs = require('fs')

let parseMessage = (message) => {
    let parts = message.content.split(' ');
    parts.shift();
    let gamertag = parts.join(' ');
    let encodedGamertag = encodeURIComponent(gamertag);
    return encodedGamertag;
}

let parseListMessage = (message) => {
    let parts = message.content.split(' ');
    parts.shift();
    let argIndex = parts.indexOf('-n');
    
    let numClips = -1;

    if (argIndex > -1 && argIndex+1 < parts.length && !isNaN(parts[argIndex +1]) ) {
        numClips = Math.min(10, parseInt(parts[argIndex +1]))
        parts.splice(argIndex, 2);
        let gamertag = parts.join(' ');
        let encodedGamertag = encodeURIComponent(gamertag);
        return {encodedGamertag, numClips};
    } else {
        return {encodedGamertag: null, numClips: null}
    }
}

let getXuid = async (encodedGamertag) => {
    let { data: {xuid} } = await axios.get(
        'https://xboxapi.com/v2/xuid/' + encodedGamertag,
        {
            headers: {
                "X-AUTH": process.env.XBOX_API_TOKEN
            }
        })

    return xuid;
}

let getClipUris = async (xuid) => {
    let { data: clips } = await axios.get(
        'https://xboxapi.com/v2/' + xuid + '/game-clips',
        {
            headers: {
                "X-AUTH": process.env.XBOX_API_TOKEN
            }
        })

    let clipUris = clips.map(clip => clip.gameClipUris[0].uri);

    while (clipUris.length > 10) {
        clipUris.pop()
    };

    return clipUris;
}

let downloadClip = async (clipUri, encodedGamertag) => {

    return await new Promise((resolve, reject) => {

        let options = {
            directory: __dirname + '/clips',
            filename: "" + Math.floor(Math.random() * 10000) + encodedGamertag+".mp4"
        }
        download(clipUri, options, function (err) {
            if (err) throw reject(err)

            resolve(options.directory+'/'+options.filename)
        }) 

    });
    
}

let uploadToStreamable =  async (clipPath) => {
    
    let attemptUpload = async (clipPath) => {
        return await new Promise((resolve, reject) => {
            var req = request.post({
                url: 'https://api.streamable.com/upload',
                headers: {
                    "Authorization": process.env.STREAMABLE_AUTH,
                    "User-Agent": "Adams Bot"
                }
            }, function (err, resp, body) {
                if (err) {
                    reject(err);
                } else {
                    resolve(body)
                }
            });
            var form = req.form();
            form.append('file', fs.createReadStream(clipPath));
        })
    }
    let error;
    const MAX_RETRIES = 3;
    let attempts = 0;
    let body;

    do {
        body = await attemptUpload(clipPath).catch(err => error = err);
        if (error) throw new Error('Upload failed')
        attempts++;
    } while (attempts < MAX_RETRIES && (body.toString().includes('Must upload a file') || body.toString().includes('Too many requests')))

    if (attempts == MAX_RETRIES) throw new Error('Too many retries')

    return 'https://streamable.com/' + JSON.parse(body).shortcode
}

let testStreamableLink = async (streamableLink) => {
    await new Promise((resolve, reject) => {
        setTimeout(() => resolve(), 3000);
    });

    let {data} = await axios.get(streamableLink)
    return data;
}


bot.on('ready', () => {                                // When the bot is ready
    console.log('Ready!');                             // Log "Ready!"
});
 
bot.on('messageCreate', async (msg) => {                     // When a message is created

    let error;
    if(msg.content.startsWith('/clip ') || msg.content.startsWith('/momgetthecamera ')) {      

        let encodedGamertag = parseMessage(msg);
        let botMessage = await bot.createMessage(msg.channel.id, "Looking up Gamtertag "+ decodeURIComponent(encodedGamertag)+ "...");

        let xuid = await getXuid(encodedGamertag).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Hmm, I can't find that Gamertag... did you spell it right?")
            return;
        } else {
            botMessage.edit("Finding latest clip...")
        }

        let clipUris = await getClipUris(xuid).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to find your latest clip.")
            return;
        } else {
            botMessage.edit("Downloading clip...")
        }

        let clipPath = await downloadClip(clipUris[0], encodedGamertag).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to download your latest clip.")
            return;
        } else {
            botMessage.edit("Uploading to Streamable...")
        }

        let streamableLink = await uploadToStreamable(clipPath).catch(err => error = err);
        if (error) {
            console.log(error);
            fs.unlinkSync(clipPath);
            botMessage.edit("Sorry, I can't seem to upload your latest clip.")
            return;
        } else {
            fs.unlinkSync(clipPath);
            botMessage.edit("Clip uploaded! Give Streamable a second to process the video")
        }

        let response;
        let dotCount = 1;
        do {
            botMessage.edit("Clip uploaded! Give Streamable a second to process the video" + ".".repeat(dotCount))
            dotCount++;
            response = await testStreamableLink(streamableLink).catch(err => console.log(err));
        } while (response.toString().includes('<h1>Processing Video</h1>'))

        botMessage.edit("Here's your clip!")
        bot.createMessage(msg.channel.id, streamableLink)
        
    }

    if (msg.content.startsWith('/clips ')) {
        

        let botMessage = await bot.createMessage(msg.channel.id, "Looking up Gamtertag");
        
        let { encodedGamertag, numClips } = parseListMessage(msg);

        if (!encodedGamertag || !numClips) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to read your message. The command is '/clips yourgamertaghere -n 5', did you type it right?")
            return;
        } else {
            botMessage.edit("Looking up Gamtertag " + decodeURIComponent(encodedGamertag) + "...")
        }

        let xuid = await getXuid(encodedGamertag).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Hmm, I can't find that Gamertag... did you spell it right?")
            return;
        } else {
            botMessage.edit("Finding " + numClips + " latest clips...")
        }

        let clipUris = await getClipUris(xuid).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to find your latest clips.")
            return;
        } else {
            botMessage.edit("Downloading clips...")
        }

        let downloadPromises = clipUris.map(clipUri => {
            return downloadClip(clipUri, encodedGamertag)
        })

        let downloadResults = await Promise.all(downloadPromises).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to download your latest clips.")
            return;
        } else {
            botMessage.edit("Uploading to Streamable...")
        }

        let streamableLinks = [];
        let lastUploadPromise = downloadResults.reduce((p, clipPath) => {
            return p.then(result => {
                if (result) streamableLinks.push(result)
                return uploadToStreamable(clipPath);
            }).catch(err => error = err)
        }, Promise.resolve())
        lastUploadPromise.then(result => streamableLinks.push(result)).catch(err => error = err);
        if (error) {
            console.log(error);
            downloadResults.forEach(clipPath => fs.unlinkSync(clipPath));
            botMessage.edit("Sorry, I can't seem to upload your latest clips.")
            return;
        } else {
            botMessage.edit("Clips uploaded! Give Streamable a second to process the videos...")
        }

        let processingPromises = streamableLinks.map((streamableLink, i) => {

            return new Promise(async (resolve, reject) => {
                let response;
                
                do {
                    console.log(streamableLink)
                    response = await testStreamableLink(streamableLink).catch(err => console.log(err));
                } while (response.toString().includes('<h1>Processing Video</h1>'))

                
                resolve(bot.createMessage(msg.channel.id, "Clip #" + (i + 1) + ": " + streamableLink))
            })

            
        })
        Promise.all(processingPromises).then(() => {
            botMessage.edit("Here's your clips!")
        })
        
        

    }
});
 
bot.connect();                                         // Get the bot to connect to Discord