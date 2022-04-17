const axios = require("axios");

const launchesDB = require("./launches.mongo");
const planets = require("./planets.mongo");

const DEFAULT_FLIGHT_NUMBER = 100;

const launches = new Map();

const launch = {
	flightNumber: 100, // flight_number
	mission: "Kepler Exploration X", // name
	rocket: "Explorer IS1", // rocket.name
	launchDate: new Date("December 27, 2030"), // date_local
	target: "Kepler-442 b", // not applicable
	customers: ["ZTM", "NASA"], // payload.customers for each payload
	upcoming: true, // upcoming
	success: true, // success
};

saveLaunch(launch);

const SPACEX_API_URL = "https://api.spacexdata.com/v4/launches/query";

async function populateLaunches() {
	console.log("Downloading launch data...");
	const response = await axios.post(SPACEX_API_URL, {
		query: {},
		options: {
			pagination: false,
			populate: [
				{
					path: "rocket",
					select: {
						name: 1,
					},
				},
				{
					path: "payloads",
					select: {
						customers: 1,
					},
				},
			],
		},
	});

	const launchDocs = response.data.docs;
	for (const launchDoc of launchDocs) {
		const payloads = launchDoc["payloads"];
		const customers = payloads.flatMap((payload) => {
			return payload["customers"];
		});

		const launch = {
			flightNumber: launchDoc["flight_number"],
			mission: launchDoc["name"],
			rocket: launchDoc["rocket"]["name"],
			launchDate: launchDoc["date_local"],
			upcoming: launchDoc["upcoming"],
			success: launchDoc["success"],
			customers,
		};

		console.log(`${launch.flightNumber} ${launch.mission}`);

		// TODO: Populate launches collection...
	}
}

async function loadLaunchData() {
	const firstLaunch = await findLaunch({
		flightNumber: 1,
		rocket: "Falcon 1",
		mission: "FalconSat",
	});

	if (firstLaunch) {
		console.log("Launch data already loaded");
	} else {
		await populateLaunches();
	}
}

async function findLaunch(filter) {
	return await launchesDB.findOne(filter);
}

async function existsLaunchWithID(launchID) {
	return await findLaunch({
		flightNumber: launchID,
	});
}

async function getLatestFlightNumber() {
	const latestLaunch = await launchesDB.findOne().sort("-flightNumber");

	if (!latestLaunch) {
		return DEFAULT_FLIGHT_NUMBER;
	}

	return latestLaunch.flightNumber;
}

async function getAllLaunches() {
	return await launchesDB.find({}, { id: 0, __v: 0 });
}

async function saveLaunch(launch) {
	const planet = await planets.findOne({
		keplerName: launch.target,
	});

	if (!planet) {
		throw new Error("No matching planet was found..");
	}

	await launchesDB.findOneAndUpdate(
		{
			flightNumber: launch.flightNumber,
		},
		launch,
		{
			upsert: true,
		}
	);
}

async function scheduleNewLaunch(launch) {
	const newFlightNumber = (await getLatestFlightNumber()) + 1;

	const newLaunch = Object.assign(launch, {
		success: true,
		upcoming: true,
		customers: ["ZTM", "NASA"],
		flightNumber: newFlightNumber,
	});

	await saveLaunch(newLaunch);
}

async function abortLaunchByID(launchID) {
	const aborted = await launchesDB.updateOne(
		{
			flightNumber: launchID,
		},
		{
			upcoming: false,
			success: false,
		}
	);

	return aborted.modifiedCount === 1;
}

module.exports = {
	loadLaunchData,
	existsLaunchWithID,
	getAllLaunches,
	scheduleNewLaunch,
	abortLaunchByID,
};
