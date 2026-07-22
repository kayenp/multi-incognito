
function genRandom(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function genOs() {
	const osArr = ["windows", "linux", "macos"];
	return osArr[genRandom(0,2)];
}

function genTimezone() {
	const timezoneArr = [
		"America/New_York", 
		"America/Detroit", 
		"America/Chicago", 
		"America/Indiana/Knox",
		"America/Menominee",
		"America/Denver",
		"America/Phoenix",
		"America/Los_Angeles",
		"America/Anchorage",
		"Pacific/Honolulu",
	];

	return timezoneArr[genRandom(0, timezoneArr.length-1)];
}

function genLang() {
	const langArr = ["en", "en-GB"];

	return langArr[genRandom(0,1)];
}

export function genFingerprints() {
	return {
		seed: genRandom(0, 2147483647),
		os: genOs(),
		timezone: genTimezone(),
		lang: genLang(),
	}
}