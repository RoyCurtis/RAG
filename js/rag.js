var synth   = window.speechSynthesis;
var signage = document.querySelector('.signage');

window.onbeforeunload = function (ev)
{
    synth.cancel();
};

function randInt(min, max)
{
    return Math.floor( Math.random() * (max - min) ) + min;
}

function randArray(arr, min, max)
{
    if ( !Number.isInteger(min) )
        min = 0;

    if ( !Number.isInteger(max) )
        max = arr.length;

    return arr[ randInt(min, max) ];
}

function randBool(chance)
{
    if ( !Number.isInteger(chance) )
        chance = 50;

    return randInt(0, 100) < chance;
}

function randTime()
{
    var hour   = randInt(0, 23).toString().padStart(2, '0');
    var minute = randInt(0, 59).toString().padStart(2, '0');

    return hour + ':' + minute;
}

function randStations(count)
{
    var keys  = Object.keys(DATA_STATIONS);
    var codes = [];
    var names = [];

    while (codes.length < count)
    {
        var key = randArray(keys);

        if ( codes.indexOf(key) === -1 )
        {
            codes.push(key);
            names.push(DATA_STATIONS[key]);
        }
    }

    return {
        count: codes.length,
        codes: codes,
        names: names
    };
}

signage.onclick = function(ev)
{
    var phrase = "";

    do {
        var data = {};

        phrase = randArray(PHRASES).replace(/\{([A-Z0-9_]+)\}/gi, function(match, token)
        {
            token = token.toUpperCase();

            if ( !data[token] )
                data[token] = randData(token, data);

            return data[token];
        });

    } while (phrase === signage.innerText)

    synth.cancel();

    signage.innerText = phrase;
    signage.innerText.split('. ').forEach(function (value)
    {
        var utter = new SpeechSynthesisUtterance(value);

        synth.speak(utter);
    });
};

function randData(slot, state)
{
    switch (slot)
    {
        case 'PLATFORM':
            return randInt(1, 18)
                + ( randBool(10) ? randArray(['A', 'B', 'C']) : '' );

        case 'TIME':
            return randTime();

        case 'MINUTES':
            return randInt(5, 60);

        case 'SERVICE':
            return randArray(DATA_SERVICES);

        case 'EXCUSE':
            return randArray(DATA_EXCUSES);

        case 'DELAY':
            return state['MINUTES'] > 15
                ? ' ' + state['SERVICE'] + ' apologises for this delay.'
                : '';

        case 'STATION':
        case 'STATION2':
            return randStations(1).names[0];

        case 'STATION_LIST':
            var stations = randStations( randInt(1, 18) );

            // Make sure last station is actually the destination
            stations.names[stations.count - 1] = state['STATION'];

            if (stations.count === 1)
                return stations.names[0] + ' only';

            var last = 'and ' + stations.names[stations.count - 1];
            stations.names[stations.count - 1] = last;

            return stations.names.join(', ');

        case 'COACHES':
            var coaches = randInt(1, 8);

            return VOCAB_DIGITS[coaches] + ' '
                + ( coaches === 1 ? 'coach' : 'coaches' );

        default:
            return slot.innerText;
    }
}
