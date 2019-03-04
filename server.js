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

let getLatestClipUri = async (xuid) => {
    let { data: clips } = await axios.get(
        'https://xboxapi.com/v2/' + xuid + '/game-clips',
        {
            headers: {
                "X-AUTH": process.env.XBOX_API_TOKEN
            }
        })

    console.log("# URIs: " + clips[0].gameClipUris.length)    
    let uri = clips[0].gameClipUris[0].uri;

    return uri;
}

let downloadClip = async (clipUri, encodedGamertag) => {

    return await new Promise((resolve, reject) => {

        let options = {
            directory: __dirname + '/clips',
            filename: encodedGamertag+".mp4"
        }
        download(clipUri, options, function (err) {
            if (err) throw reject(err)

            resolve(options.directory+'/'+options.filename)
        }) 

    });
    
}

let uploadToStreamable =  async (clipPath) => {

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
                resolve('https://streamable.com/' + JSON.parse(body).shortcode)
            }
        });
        var form = req.form();
        
        form.append('file', fs.createReadStream(clipPath));
    })
   
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


    if(msg.content.startsWith('/clip ')) {      

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

        let clipUri = await getLatestClipUri(xuid).catch(err => error = err);
        if (error) {
            console.log(error);
            botMessage.edit("Sorry, I can't seem to find your latest clip.")
            return;
        } else {
            botMessage.edit("Downloading clip...")
        }

        let clipPath = await downloadClip(clipUri, encodedGamertag).catch(err => error = err);
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

        let response = await testStreamableLink(streamableLink).catch(err => console.log(err));
        let dotCount = 1;
        while (response.toString().includes('<h1>Processing Video</h1>')) {
            botMessage.edit("Clip uploaded! Give Streamable a second to process the video"+".".repeat(dotCount))
            dotCount++;
            response = await testStreamableLink(streamableLink).catch(err => console.log(err));
        }

        botMessage.edit("Here's your clip!")
        bot.createMessage(msg.channel.id, streamableLink)
        
    }
});
 
bot.connect();                                         // Get the bot to connect to Discord