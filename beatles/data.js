"use strict";

// Numbers reported in Glickman, Brown & Song (2019), "(A) Data in the Life:
// Authorship Attribution in Lennon-McCartney Songs", Harvard Data Science Review 1.1.

// Table 2: leave-one-out P(McCartney) for the 39 Lennon songs or song portions.
const LENNON_SONGS = [
  ["All I've Got To Do", 0.008],
  ["Doctor Robert", 0.012],
  ["I'm Happy Just to Dance With You", 0.038],
  ["No Reply", 0.041],
  ["Girl", 0.047],
  ["I'll Be Back", 0.048],
  ["I'm Only Sleeping", 0.049],
  ["There's a Place", 0.064],
  ["I'll Cry Instead", 0.065],
  ["When I Get Home", 0.066],
  ["And Your Bird Can Sing", 0.067],
  ["Help!", 0.071],
  ["We Can Work It Out (Bridge)", 0.071],
  ["You're Going to Lose that Girl", 0.076],
  ["I'm a Loser", 0.1],
  ["Run For Your Life", 0.109],
  ["It's Only Love", 0.111],
  ["This Boy", 0.128],
  ["I Call Your Name", 0.148],
  ["It Won't Be Long", 0.178],
  ["Please Please Me", 0.185],
  ["You Can't Do That", 0.231],
  ["Ticket to Ride", 0.244],
  ["A Hard Day's Night (Verse/Chorus)", 0.279],
  ["Day Tripper", 0.294],
  ["I Don't Want to Spoil the Party", 0.332],
  ["Tomorrow Never Knows", 0.378],
  ["Not a Second Time", 0.39],
  ["Tell Me Why", 0.438],
  ["Nowhere Man", 0.445],
  ["You've Got to Hide Your Love Away", 0.524],
  ["If I Fell", 0.574],
  ["Any Time At All", 0.588],
  ["I Feel Fine", 0.598],
  ["I Should Have Known Better", 0.615],
  ["Norwegian Wood (Verse/Chorus)", 0.666],
  ["Yes It Is", 0.802],
  ["She Said She Said", 0.836],
  ["What Goes On (Verse/Chorus)", 0.944],
];

// Table 3: leave-one-out P(McCartney) for the 31 McCartney songs or song portions.
const MCCARTNEY_SONGS = [
  ["You Won't See Me", 0.069],
  ["And I Love Her (Verse/Chorus)", 0.105],
  ["For No One", 0.184],
  ["Here There and Everywhere", 0.202],
  ["PS I Love You", 0.282],
  ["I'll Follow the Sun", 0.284],
  ["Can't Buy Me Love", 0.44],
  ["Got to Get You Into My Life", 0.448],
  ["Eight Days a Week", 0.528],
  ["Eleanor Rigby", 0.57],
  ["I'm Down", 0.606],
  ["Hold Me Tight", 0.606],
  ["She's a Woman", 0.66],
  ["I've Just Seen a Face", 0.668],
  ["Tell Me What You See", 0.668],
  ["What You're Doing", 0.679],
  ["Drive My Car", 0.688],
  ["Yesterday", 0.689],
  ["The Night Before", 0.715],
  ["All My Loving", 0.719],
  ["Yellow Submarine", 0.734],
  ["Every Little Thing", 0.806],
  ["We Can Work It Out (Verse/Chorus)", 0.866],
  ["Michelle (Verse/Chorus)", 0.912],
  ["Things We Said Today", 0.938],
  ["Good Day Sunshine", 0.953],
  ["I'm Looking Through You", 0.957],
  ["Another Girl", 0.964],
  ["I Saw Her Standing There", 0.979],
  ["I Wanna Be Your Man", 0.986],
  ["Love Me Do", 0.989],
];

// Table 4: the 29 features with non-zero coefficients in the final model.
// Positive coefficients lean McCartney; negative coefficients lean Lennon.
// `id` links a coefficient to a category produced by the feature extractor in app.js.
// The c-statistic is the leave-one-out AUC with that feature removed (lower = more important).
const INTERCEPT = -0.796;
const COEFFICIENTS = [
  { id: "chord:V", family: "chord", label: "Chord: V", weight: 1.096, c: 0.806 },
  { id: "chord:iii", family: "chord", label: "Chord: iii", weight: -0.35, c: 0.842 },
  { id: "note:1", family: "note", label: "Note: ♭2", weight: -0.874, c: 0.817 },
  { id: "note:3", family: "note", label: "Note: ♭3", weight: 0.603, c: 0.828 },
  { id: "note:5", family: "note", label: "Note: 4", weight: 1.347, c: 0.788 },
  { id: "note:9", family: "note", label: "Note: 6", weight: 0.046, c: 0.825 },
  { id: "ct:I-vi", family: "ct", label: "Chords: between I and vi", weight: -0.315, c: 0.823 },
  { id: "ct:ii-iii", family: "ct", label: "Chords: between ii and iii", weight: -0.255, c: 0.846 },
  { id: "ct:ii-IV", family: "ct", label: "Chords: between ii and IV", weight: 1.428, c: 0.795 },
  { id: "ct:ii-V", family: "ct", label: "Chords: between ii and V", weight: -0.291, c: 0.83 },
  { id: "ct:ND>dia", family: "ct", label: "Chords: non-diatonic → diatonic", weight: -0.096, c: 0.833 },
  { id: "mt:pair:4>♭3", family: "mt", label: "Melody: 4 → ♭3", weight: 0.481, c: 0.849 },
  { id: "mt:pair:♭3>1", family: "mt", label: "Melody: ♭3 → 1", weight: 1.206, c: 0.778 },
  { id: "mt:step:down", family: "mt", label: "Melody: down one scale step", weight: -0.348, c: 0.824 },
  { id: "mt:nd:half-down-to-dia", family: "mt", label: "Melody: half step down from off-scale note onto scale", weight: 1.03, c: 0.797 },
  { id: "mt:end:5", family: "mt", label: "Melody: phrase ends on 5", weight: -0.633, c: 0.808 },
  { id: "mt:rep:6", family: "mt", label: "Melody: repeated 6", weight: -0.218, c: 0.825 },
  { id: "mt:step:up", family: "mt", label: "Melody: up one scale step", weight: -0.576, c: 0.821 },
  { id: "mt:nd:half-up-to-dia", family: "mt", label: "Melody: half step up from off-scale note onto scale", weight: -1.232, c: 0.798 },
  { id: "mt:pair:1>♭3", family: "mt", label: "Melody: 1 → ♭3", weight: 0.376, c: 0.833 },
  { id: "mt:pair:3>1", family: "mt", label: "Melody: 3 → 1", weight: 0.284, c: 0.829 },
  { id: "mt:pair:4>5", family: "mt", label: "Melody: 4 → 5", weight: -0.653, c: 0.816 },
  { id: "mt:nd:leap-up", family: "mt", label: "Melody: leap up from or to an off-scale note", weight: 1.135, c: 0.806 },
  { id: "co:UUD", family: "co", label: "Contour: up, up, down", weight: -0.098, c: 0.841 },
  { id: "co:DDS", family: "co", label: "Contour: down, down, same", weight: 0.535, c: 0.824 },
  { id: "co:USS", family: "co", label: "Contour: up, same, same", weight: -0.098, c: 0.835 },
  { id: "co:DUS", family: "co", label: "Contour: down, up, same", weight: -0.938, c: 0.825 },
  { id: "co:SDU", family: "co", label: "Contour: same, down, up", weight: -0.501, c: 0.812 },
  { id: "co:UDU", family: "co", label: "Contour: up, down, up", weight: -0.555, c: 0.826 },
];

// Table 5: disputed songs or portions, P(McCartney) with leave-one-out 95% intervals.
const DISPUTED_SONGS = [
  { name: "Ask Me Why", p: 0.057, low: 0.018, high: 0.08 },
  { name: "A Hard Day's Night (Bridge)", p: 0.069, low: 0.016, high: 0.135 },
  { name: "Do You Want to Know a Secret", p: 0.08, low: 0.033, high: 0.097 },
  { name: "In My Life (Verse)", p: 0.189, low: 0.079, high: 0.307 },
  { name: "Michelle (Bridge)", p: 0.199, low: 0.109, high: 0.3 },
  { name: "What Goes On (Bridge)", p: 0.235, low: 0.088, high: 0.255 },
  { name: "Wait", p: 0.391, low: 0.275, high: 0.54 },
  { name: "In My Life (Bridge)", p: 0.435, low: 0.27, high: 0.692 },
];

// Table 6: songs known to be collaborations.
const COLLABORATIVE_SONGS = [
  { name: "I'll Get You", p: 0.062, low: 0.016, high: 0.107 },
  { name: "Thank You Girl", p: 0.106, low: 0.036, high: 0.202 },
  { name: "I Want to Hold Your Hand", p: 0.115, low: 0.065, high: 0.182 },
  { name: "And I Love Her (Bridge)", p: 0.263, low: 0.11, high: 0.315 },
  { name: "Misery", p: 0.31, low: 0.245, high: 0.451 },
  { name: "Norwegian Wood (Bridge)", p: 0.33, low: 0.135, high: 0.408 },
  { name: "Little Child", p: 0.337, low: 0.175, high: 0.417 },
  { name: "From Me To You", p: 0.606, low: 0.51, high: 0.721 },
  { name: "She Loves You", p: 0.616, low: 0.515, high: 0.733 },
  { name: "Baby's in Black", p: 0.92, low: 0.822, high: 0.977 },
  { name: "The Word", p: 0.976, low: 0.899, high: 0.994 },
];

if (typeof module !== "undefined") {
  module.exports = {
    LENNON_SONGS,
    MCCARTNEY_SONGS,
    INTERCEPT,
    COEFFICIENTS,
    DISPUTED_SONGS,
    COLLABORATIVE_SONGS,
  };
}
