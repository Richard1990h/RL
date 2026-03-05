# FiveM Complete Resource System Map

> Comprehensive mapping of every resource in `fivem/hkc/resources/`
> Generated 2026-02-25 -- covers all resource folders

---

## Table of Contents

1. [HK-debug](#hk-debug) -- Bug reports, suggestions, server management
2. [hk-prologuemission](#hk-prologuemission) -- New-player plane fly-in
3. [hkc_pvp](#hkc_pvp) -- PVP kill tracking and zones
4. [hkc_truckerjob](#hkc_truckerjob) -- Trucker/haulage delivery job
5. [hkc_ubermission](#hkc_ubermission) -- Private hire taxi job
6. [hkcore](#hkcore) -- Core character, accounts, money, appearance
7. [hkdrift](#hkdrift) -- Drift mode toggle
8. [hkeconomy](#hkeconomy) -- Marked funds, crypto, crafting, contraband, shops
9. [hkfuel](#hkfuel) -- Vehicle fuel system
10. [hkgangs](#hkgangs) -- Gang territory capture and gang chat
11. [hkgarage](#hkgarage) -- Vehicle garage, storage, impound
12. [hkhospital](#hkhospital) -- Death, injuries, respawn, hospital
13. [hkhousing](#hkhousing) -- Property ownership and stash
14. [hkinsurance](#hkinsurance) -- Vehicle insurance and firearms certificates
15. [hkinventory](#hkinventory) -- Inventory system and death bags
16. [hkjobs](#hkjobs) -- Job center, duty, boss, invoices, taxi meter
17. [hklicence](#hklicence) -- DVLA licence system with theory/practical tests
18. [hklostmc](#hklostmc) -- Lost MC clubhouse and faction check
19. [hkneeds](#hkneeds) -- Hunger, thirst, stamina HUD
20. [hknos](#hknos) -- Vehicle nitrous system
21. [hkpolice](#hkpolice) -- Complete police system (MDT, dispatch, arrests, warrants...)
22. [hkregistration](#hkregistration) -- Character registration/creation
23. [hkrentals](#hkrentals) -- Vehicle rental system
24. [hksociety](#hksociety) -- Society/organization management and money
25. [hktarget](#hktarget) -- 3D interaction targeting framework
26. [hktrade](#hktrade) -- Player-to-player trading
27. [hkui](#hkui) -- UI framework (notifications, help text, HUD)

---

## Shared Database Tables (Referenced By Multiple Resources)

| Table | Owner | Also Used By |
|---|---|---|
| `hk_accounts` | hkcore | hkregistration |
| `hk_characters` | hkcore | hkregistration, hksociety, hkrentals |
| `hk_money` (cash, bank, dirty, crypto) | hkcore | hkeconomy, hkfuel, hkc_truckerjob, hkc_ubermission, hksociety, hkjobs |
| `hk_jobs` | hkjobs | hkgangs, hksociety |
| `hk_character_jobs` | hkjobs | hksociety |
| `hk_job_grades` | hksociety | hkgangs, hkjobs |
| `hk_vehicles` | hkgarage | hkc_ubermission, hkinsurance |

---

## Cross-Resource Export Dependency Graph

```
hkcore (CENTRAL HUB)
  Consumed by: hkeconomy, hkfuel, hkgarage, hkgangs, hkhospital, hkinsurance,
               hkjobs, hklicence, hklostmc, hkneeds, hkpolice, hkregistration,
               hkrentals, hksociety, hktrade, hkc_truckerjob, hkc_ubermission

hkinventory
  Consumed by: hkeconomy, hktrade, hkfuel

hkjobs
  Consumed by: hkgangs, hklostmc, hkrentals, hkc_ubermission

hklicence
  Consumed by: hkc_truckerjob, hkc_ubermission

hkhospital
  Consumed by: hkneeds (IsInComa), hk-prologuemission (death checks)

hkui
  Consumed by: hkc_truckerjob, hkc_ubermission, hkfuel, hkgarage, hkhousing,
               hkinsurance, hkrentals

hksociety
  Consumed by: hkrentals

hktarget
  Consumed by: hkhousing, hkrentals, hkpolice, hkfuel (3D interaction points)

hkpolice
  Consumed by: (standalone, exports queried by admin/other resources)

hkgangs
  Consumed by: (standalone, exports queried by gang-related resources)
```

---

## Resource Details

---

### HK-debug

**Purpose:** Bug report / suggestion / player report submission system, plus server heartbeat, remote command polling, console log flushing, and auto-resource-update from the RallyLive.ca API.

**fxmanifest.lua:** shared `config.lua`, client `client/main.lua`, server `server/main.lua`, NUI `html/`

**Config (`config.lua`):**
- `Config.ServerSlug` -- server identifier for API
- `Config.ApiBaseUrl` -- RallyLive.ca API endpoint (convar `hk_api_base_url`)
- `Config.ApiKey` -- API key (convar `hk_api_key`)

**Server Events:**
- `hk-debug:submitBug` -- submit a bug report to API
- `hk-debug:submitSuggestion` -- submit a suggestion to API
- `hk-debug:submitReport` -- submit a player report to API
- `hk-debug:followupBug` -- add follow-up to a bug
- `hk-debug:followupSuggestion` -- add follow-up to a suggestion
- `hk-debug:followupReport` -- add follow-up to a report
- `hk-debug:getMyReports` -- fetch player's bug reports
- `hk-debug:getMySuggestions` -- fetch player's suggestions
- `hk-debug:getMyPlayerReports` -- fetch player's player reports

**Client Events:**
- `hk-debug:submitResult` -- result callback after submission
- `hk-debug:myReports` -- receive bug reports list
- `hk-debug:mySuggestions` -- receive suggestions list
- `hk-debug:myPlayerReports` -- receive player reports list
- `hk-debug:refreshCountdown` -- cooldown timer update

**NUI Callbacks:**
- `close`, `submit_bug`, `submit_suggestion`, `submit_report`
- `followup_bug`, `followup_suggestion`, `followup_report`
- `getMyReports`, `getMySuggestions`, `getMyPlayerReports`

**Exports:** None

**Database Tables:** None (uses external API)

**Dependencies:** None (standalone)

**Called By:** Player via F3 keybind

**Notable:** Server thread polls API every 15s for pending commands (resource ensure/update), heartbeat every 60s, console log flush.

---

### hk-prologuemission

**Purpose:** Flies new characters into LSIA on a cinematic recorded flight path (Luxor Deluxe jet), then places them at the terminal.

**fxmanifest.lua:** depends on `oxmysql`, shared `config.lua`, client + server main.lua

**Config (`config.lua`):**
- `PrologueConfig.PlaneModel` = `"luxor2"` (Luxor Deluxe jet)
- `PrologueConfig.LandingPos` = `vector4(-1037.00, -2738.00, 20.17, 157.0)` (LSIA terminal)
- `PrologueConfig.SpawnPos` = `vector4(-3500.0, -1200.0, 800.0, 120.0)` (ocean, high altitude)
- `PrologueConfig.Waypoints` = 8 waypoints descending from 750 to 25 altitude
- `PrologueConfig.UseCamera` = true, `CameraFov` = 55.0
- `PrologueConfig.MaxFlightTime` = 90 seconds (safety timeout)
- `PrologueConfig.PlayerSpawnPos` = LSIA terminal coords

**Server Events:**
- Listens to `hkcore:createCharacter` -- triggers prologue for new characters
- Listens to `hkcore:server:characterCreated` -- alternative trigger
- Admin command: `/prologue [id]`

**Client Events:**
- `hk-prologuemission:client:start` -- starts the cinematic flight sequence

**Exports:** None

**NUI Callbacks:** None

**Database Tables:** None

**Dependencies:**
- `oxmysql`
- Triggers `hkhospital:client:setDeathChecksEnabled` (disables death during flight)
- Sets `LocalPlayer.state.hk_insetup` and `hk_spawn_state`

**Called By:** hkcore (on character creation)

---

### hkc_pvp

**Purpose:** Tracks player-vs-player kills with weapon type and zone, admin toggle for PVP zones.

**fxmanifest.lua:** server-only (`server.lua`)

**Server Events:**
- `baseevents:onPlayerSpawned` -- player spawn hook
- `hkc_pvp:server:requestState` -- client requests current PVP state
- `hkc_pvp:server:onPlayerKilled` -- records a kill

**Client Events:**
- `hkc_pvp:client:syncState` -- receive PVP zone state
- `hkc_pvp:client:enterZone` / `hkc_pvp:client:leaveZone` -- zone boundary events

**Exports:** None

**NUI Callbacks:** None

**Database Tables:**
- `hkc_pvp_kills` (killer_id, victim_id, weapon, zone_name, created_at)

**Config:** None (hardcoded zones)

**Dependencies:** `oxmysql`

**Admin Commands:** `/pvp [on|off|zones|status|stats]`

**Called By:** Standalone; listens to base game events

---

### hkc_truckerjob

**Purpose:** Trucker/haulage delivery job -- players drive trailers from a depot to delivery points for cash payouts.

**fxmanifest.lua:** depends on `oxmysql`, shared `config.lua`, NUI `html/`

**Config (`config.lua`):**
- `TruckerConfig.DepotCoords` = `vector3(858.5, -3204.5, 5.99)`
- 8 delivery missions ($500 - $2100 payout)
- 4 trailer types: `trailers`, `trailers2`, `trailers3`, `tanker`
- Truck models: `phantom`, `packer`, `hauler`
- `TruckerConfig.UseNUIDispatch` = true (NUI mission select)

**Server Events:**
- `hkc_truckerjob:server:checkLicence` -- verify HGV licence
- `hkc_truckerjob:server:acceptMission` -- accept a delivery mission
- `hkc_truckerjob:server:completeMission` -- complete delivery, receive payout
- `hkc_truckerjob:server:cancelMission` -- cancel active mission
- `hkc_truckerjob:server:isDev` -- check dev mode

**Client Events:**
- `hkc_truckerjob:client:licenceResult` -- licence check result
- `hkc_truckerjob:client:missionAccepted` -- mission started
- `hkc_truckerjob:client:missionDenied` -- mission denied
- `hkc_truckerjob:client:isDev` -- dev mode status

**NUI Callbacks:**
- `nuiClose`, `nuiBack`, `nuiSelectTrailer`, `nuiAcceptMission`

**Exports:** None

**Database Tables:**
- `hk_trucker_deliveries` (character_id, mission_index, trailer_type, payout, completed_at)
- Also reads/writes `hk_money` directly

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)` -- get character ID
- `exports.hklicence:HasLicence(charId, 'hgv')` -- require HGV licence
- `TriggerEvent('hkui:notify', ...)` -- notifications

**Called By:** Player interaction at depot

---

### hkc_ubermission

**Purpose:** Private hire / taxi job -- players pick up NPC passengers from locations across the map and drive them to destinations for fare payouts.

**fxmanifest.lua:** depends on `oxmysql`, shared `config.lua`

**Config (`config.lua`):**
- `JobName` = `"HKC Private Hire"`
- `RequiredJobNames` = `{"privatehire", "uber", "taxi"}`
- `RequiredLicenceType` = `"car"`
- `BaseFare` = 50, `FarePerUnit` = 2
- `RequireOwnedVehicle` = true
- 31 pickup locations, 53 destinations
- `DepotCoords` = configured spawn point

**Server Events:**
- `hkc_ubermission:requestStart` -- request to start a shift
- `hkc_ubermission:queryDepotAccess` -- check depot access
- `hkc_ubermission:endShift` -- end taxi shift
- `hkc_ubermission:passengerPickedUp` -- passenger pickup confirmed
- `hkc_ubermission:dropOff` -- passenger dropped off, payout
- `hkc_ubermission:validateCurrentVehicle` -- validate owned vehicle
- `hkc_ubermission:registerVehicle` -- register vehicle for shift

**Client Events:**
- `hkc_ubermission:startApproved` -- shift start approved
- `hkc_ubermission:vehicleRegistered` -- vehicle accepted
- `hkc_ubermission:notify` -- notification
- `hkc_ubermission:ownedVehicleResult` -- vehicle ownership check result
- `hkc_ubermission:depotAccess` -- depot access result

**Exports:** None

**NUI Callbacks:** None

**Database Tables:**
- `hkc_uber_stats` (character_id, fares_completed, total_earned, last_shift)
- Also reads/writes `hk_money`, `hk_vehicles`

**Dependencies:**
- `exports.hkcore:GetPlayer(src)`, `exports.hkcore:GetCharacterId(src)`
- `exports.hkjobs:GetPlayerJobName(src)` -- verify taxi/privatehire job
- `exports.hklicence:HasLicence(charId, req)` -- verify car licence
- `exports.hkui:Notify()` -- notifications

**Called By:** Player interaction at depot

---

### hkcore

**Purpose:** Central core resource -- manages accounts, characters, character appearance (creator UI), and money (cash, bank, dirty, crypto). Almost every other resource depends on hkcore exports.

**fxmanifest.lua:** depends on `oxmysql`, NUI for character creator

**Config:** Minimal; core constants hardcoded.

**Server Events:**
- `hkcore:createCharacter` -- create a new character
- `hkcore:saveAppearance` -- save character appearance after creator
- `hkcore:requestAppearance` -- client requests saved appearance on spawn
- `hkcore:server:characterCreated` -- broadcast after character creation

**Client Events:**
- `hkcore:client:openCreator` -- open character appearance creator UI
- `hkcore:client:applyAppearance` -- apply saved appearance on spawn/reconnect
- `hkcore:client:updateMoney` -- money balance update notification
- `hkui:closeAllPanels` -- close all NUI panels (respects `except` param)

**NUI Callbacks (Character Creator):**
- `changeComponent` -- change a ped component (hat, shirt, pants, etc.)
- `applyPreset` -- apply a preset outfit (Default, Casual, Smart)
- `getComponentInfo` -- get current ped component info
- `rotateCharacter` -- rotate character in creator
- `confirmAppearance` -- confirm and save appearance
- `closeCreator` -- blocked (must confirm)

**Server Exports (CRITICAL -- most resources depend on these):**
- `AwaitSchemaReady` -- wait for DB schema initialization
- `GetIdentifier(src)` -- get player's license identifier
- `GetCharacterId(src)` -- get active character ID for a player
- `HasRole(src, role)` -- check admin/mod role
- `HasPermission(src, perm)` -- check specific permission
- `GetPlayer(src)` -- get full player object
- `GetCharacter(src)` -- get character object
- `GetCharacterData(charId)` -- get character data by ID
- `GetCharacterInfo(charId)` -- get character info
- `GetCash(src)` -- get cash balance
- `GetBank(src)` -- get bank balance
- `GiveMoney(src, type, amount)` -- add money
- `TakeMoney(src, type, amount)` -- remove money
- `RemoveMoney(src, type, amount)` -- alias for TakeMoney
- `RemoveCash(src, amount)` -- remove cash
- `RemoveBank(src, amount)` -- remove bank
- `TryRemoveMoney(src, type, amount)` -- try to remove, returns bool
- `SetDuty(src, state)` -- set duty state
- `GetPlayerJob(src)` -- get player's job info
- `GetDutyState(src)` -- get duty state
- `Notify(src, msg)` -- server-side notification
- `RemoveInventoryItem(src, item, count)` -- remove inventory item

**Client Exports:**
- `GetPlayerState()` -- stub, returns nil (consumed by hkneeds)

**Database Tables:**
- `hk_character_appearances` (character_id, model, components JSON, props JSON)
- Uses `hk_accounts`, `hk_characters`, `hk_money`

**Dependencies:** `oxmysql`

**Called By:** Nearly every resource in the [hk] folder

---

### hkdrift

**Purpose:** Toggle drift mode on vehicles via keybind -- reduces traction curve for drifting.

**fxmanifest.lua:** client-only with `config.lua` and NUI indicator

**Config (`config.lua`):**
- `DriftConfig.DriftTractionCurveMax` = 0.4
- `DriftConfig.DriftKey` = `"LSHIFT"`

**Server Events:** None

**Client Events:** None (keybind-only)

**NUI Callbacks:** None

**Exports:** None

**Database Tables:** None

**Dependencies:** None (fully standalone client-side)

**Called By:** Player via LSHIFT keybind while in vehicle

---

### hkeconomy

**Purpose:** Comprehensive economy expansion -- marked/dirty funds processing, cryptocurrency market with 8 tokens, mining rigs, crafting stations with recipes, contraband delivery jobs, ingredient/black-market shops.

**fxmanifest.lua:** depends on `hkcore`, `hkinventory`, `oxmysql`, NUI

**Config (`config.lua`):**
- **Marked Funds:** Processor locations to launder dirty money
- **Crypto Tokens:** TOKEN_A through TOKEN_H (AlphaCoin, BitVault, CashLink, DarkNet, EtherForge, FluxChain, GoldByte, HyperLedger)
- **Crypto ATMs:** Casino interior locations
- **Mining Rigs:** BASIC_RIG ($5k), PRO_RIG ($25k), ULTRA_RIG ($75k)
- **Contraband Jobs:** Configurable cooldowns, pickup/delivery zones
- **Crafting Stations:** workbench, refinery, packing_table with coordinates
- **Crafting Recipes:** Multiple recipes per station with ingredients and outputs
- **Shops:** Ingredient shop items, black market shop items
- **Item Definitions:** Full item config table

**Server Events:**
- `hkeconomy:server:submitProcessing` -- submit dirty money for laundering
- `hkeconomy:server:collectProcessed` -- collect laundered money
- `hkeconomy:server:getProcessingQueue` -- view processing status
- `hkeconomy:server:buyCrypto` -- buy crypto tokens
- `hkeconomy:server:sellCrypto` -- sell crypto tokens
- `hkeconomy:server:transferCrypto` -- transfer crypto to another player
- `hkeconomy:server:getCryptoData` -- get portfolio and market rates
- `hkeconomy:server:getMiningData` -- get mining rigs data
- `hkeconomy:server:buyMiner` -- purchase a mining rig
- `hkeconomy:server:rentMiner` -- rent a mining rig
- `hkeconomy:server:toggleOwnedMiner` / `toggleRental` -- start/stop mining
- `hkeconomy:server:claimOwnedMiner` / `claimRental` -- collect mining output
- `hkeconomy:server:requestJob` -- request contraband job
- `hkeconomy:server:arrivePickup` -- arrive at contraband pickup
- `hkeconomy:server:completeDelivery` -- complete contraband delivery
- `hkeconomy:server:getRecipes` / `getCraftingQueue` -- crafting info
- `hkeconomy:server:startCrafting` -- start crafting
- `hkeconomy:server:collectCrafting` -- collect crafted items
- `hkeconomy:server:getShopInventory` -- get shop stock
- `hkeconomy:server:shopPurchase` -- buy from shop

**Client Events:**
- `hkeconomy:client:moneyUpdate` -- money balance change
- `hkeconomy:client:notify` -- notification
- `hkeconomy:client:processingSubmitted` / `processingQueue` -- laundering status
- `hkeconomy:client:cryptoData` -- crypto portfolio data
- `hkeconomy:client:newsEvent` -- crypto news event (affects prices)
- `hkeconomy:client:miningData` -- mining rig data
- `hkeconomy:client:recipes` / `craftingStarted` / `craftingCollected` / `craftingQueue` -- crafting events
- `hkeconomy:client:jobStarted` / `pickupDone` / `jobCompleted` -- contraband job events
- `hkeconomy:client:shopInventory` -- shop data
- `hkcore:client:updateInventory` -- inventory refresh
- `hkcore:client:updateMoney` -- money refresh

**NUI Callbacks:**
- `close`, `submitProcessing`, `collectProcessed`, `refreshProcessing`
- `buyCrypto`, `sellCrypto`, `transferCrypto`, `refreshCrypto`
- `refreshMining`, `buyMiner`, `rentMiner`, `claimRental`, `toggleOwnedMiner`, `toggleRental`, `claimOwnedMiner`
- `startCrafting`, `collectCrafting`, `refreshCrafting`
- `shopPurchase`, `requestJob`

**Server Exports:**
- `GetMarkedFunds(charId)` -- get dirty money balance
- `GiveMarkedFunds(charId, amount)` -- give dirty money
- `TakeMarkedFunds(charId, amount)` -- take dirty money
- `GetCryptoBalance(charId, token)` -- get crypto balance
- `GiveCrypto(charId, token, amount)` -- give crypto
- `GetCurrentRates()` -- get current crypto market rates
- `GetItemConfig(itemId)` -- get item definition

**Database Tables:**
- `hk_crypto_wallets` -- player crypto holdings
- `hk_crypto_market_rates` -- current token prices
- `hk_crypto_rate_history` -- historical price data
- `hk_miner_ownership` -- owned mining rigs
- `hk_mining_rentals` -- rented mining rigs
- `hk_funds_processing` -- money laundering queue
- `hk_crafting_queue` -- active crafting jobs
- `hk_job_cooldowns` -- contraband job cooldowns
- `hk_economy_log` -- economy audit log
- Also reads/writes `hk_money` directly

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, `exports.hkcore:GetPlayer(src)`, etc.
- `exports.hkinventory:AddItem()`, `RemoveItem()`, `HasItem()`, `GetInventory()`

**Called By:** Player interaction at processing stations, crypto ATMs, crafting benches, shops

---

### hkfuel

**Purpose:** Vehicle fuel system -- fuel drains while driving, refuel at gas stations (bank or cash), gas can item support.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`, NUI

**Config:** Gas station locations loaded from DB.

**Server Events:**
- `hkfuel:server:requestStations` -- get station locations
- `hkfuel:server:loadFuel` -- load fuel level for a plate
- `hkfuel:server:saveFuel` -- save fuel level for a plate
- `hkfuel:server:buyFuelBank` -- buy fuel with bank
- `hkfuel:server:buyFuelCash` -- buy fuel with cash
- `hkfuel:server:refundFuel` -- refund fuel purchase
- `hkfuel:server:useGasCan` -- use gas can item

**Client Events:**
- `hkfuel:client:receiveStations` -- receive station data
- `hkfuel:client:loadFuelResult` -- fuel level loaded
- `hkfuel:client:buyFuelResult` -- fuel purchase result
- `hkfuel:client:applyGasCan` -- apply gas can to vehicle
- `hkfuel:client:useGasCan` -- trigger gas can use

**NUI Callbacks:**
- `fuelSubmit` -- submit fuel purchase
- `fuelCancel` -- cancel fuel purchase

**Exports:** None

**Database Tables:**
- `hk_vehicle_fuel` (plate, fuel_level)
- Also reads `hk_money`

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`
- `exports.hkcore:RemoveInventoryItem(src, "gas_can", 1)`
- `hkui` for notifications

**Called By:** Automatic fuel drain thread + player interaction at gas stations

---

### hkgangs

**Purpose:** Gang territory capture system with timed capture mechanic and gang-specific chat. Seeds gang job entries into `hk_jobs`.

**fxmanifest.lua:** depends on `oxmysql`, shared config

**Config:** Territory zone definitions, capture timers, gang names.

**Server Events:**
- `hkgangs:server:requestSync` -- request territory ownership state
- `hkgangs:server:tryCapture` -- initiate territory capture
- `hkgangs:server:cancelCapture` -- cancel ongoing capture
- `hkgangs:server:finishCapture` -- complete capture

**Client Events:**
- `hkgangs:client:sync` -- receive full territory state
- `hkgangs:client:updateOwner` -- single territory ownership change
- `hkgangs:client:captureBegin` -- capture started notification

**Server Exports:**
- `GetPlayerGang(src)` -- get player's gang name (from job)
- `IsGangLeader(src)` -- check if player is gang leader

**NUI Callbacks:** None

**Database Tables:**
- Seeds into `hk_jobs` (gang job rows)
- Uses `hk_job_grades`

**Dependencies:**
- `exports.hkjobs:GetPlayerJob(src)` -- check player's job
- `exports.hkcore:GetCharacterId(src)` -- get character ID

**Called By:** Player enters territory zone; gang members only

---

### hkgarage

**Purpose:** Vehicle garage system -- store/retrieve vehicles, buy garage slots, impound lot for police-impounded vehicles.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`, NUI

**Config:** Garage locations, slot prices, impound settings.

**Server Events:**
- `hkgarage:server:getGarageData` -- get garage contents for a garage ID
- `hkgarage:server:buySlot` -- purchase additional garage slot
- `hkgarage:server:storeVehicle` -- store vehicle (plate, props, garage ID, health)
- `hkgarage:server:retrieveVehicle` -- retrieve vehicle from garage
- `hkgarage:server:getImpoundData` -- get impounded vehicles
- `hkgarage:server:retrieveFromImpound` -- retrieve from impound (costs money)
- `hkgarage:server:touchVehicle` -- update last-accessed timestamp

**Client Events:**
- `hkgarage:client:garageData` -- receive garage contents
- `hkgarage:client:impoundData` -- receive impound contents
- `hkgarage:client:slotPurchased` -- slot purchase confirmed
- `hkgarage:client:spawnVehicle` -- spawn vehicle entity
- `hkgarage:client:storeSuccess` -- vehicle stored successfully
- `hkgarage:client:deleteVehicle` -- vehicle entity deleted

**NUI Callbacks:**
- `closeUI` -- close garage UI
- `retrieveVehicle` -- retrieve from garage
- `retrieveFromImpound` -- retrieve from impound
- `buySlot` -- buy slot

**Exports:** None

**Database Tables:**
- `hk_garage_slots` (character_id, max_slots)
- Uses `hk_vehicles` (plate, model, owner_id, garage_id, props, state)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`
- `hkui` for notifications

**Called By:** Player interaction at garage/impound markers

---

### hkhospital

**Purpose:** Complete death, injury, coma, bleedout, and hospital system. Handles distress calls, revives, city respawns, injury tracking, and hospital bills. Very large resource with multiple sub-files.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`, loads `hkc_hospital/` sub-files

**Config:** Death timers, bleedout duration, respawn costs, hospital locations, injury types.

**Server Events:**
- `hkhospital:server:playerDied` -- player died
- `hkhospital:server:distressCall` -- send distress to EMS
- `hkhospital:server:revivePlayer` -- revive a player (EMS action)
- `hkhospital:server:adminRevive` -- admin revive
- `hkhospital:server:bleedoutExpired` -- bleedout timer ran out
- `hkhospital:server:cityRespawn` -- respawn at hospital (costs money)
- `hkhospital:server:giveUp` -- give up (go to hospital)
- `hkhospital:server:requestRespawnResend` -- re-send respawn data
- `hkhospital:server:diedInComa` -- died while in coma
- `hkhospital:server:requestDeathState` -- request current death state
- `hkhospital:server:SyncInjuries` -- sync injury data
- `hkhospital:checkin` -- hospital check-in
- `hkhospital:server:setDeathChecksEnabled` -- toggle death checks (used by prologue)

**Client Events:**
- Death/coma/bleedout UI events (managed internally)
- `hkhospital:client:setDeathChecksEnabled` -- toggle death checks

**Server Exports:**
- `IsPlayerDead(src)` -- is player dead
- `IsPlayerInComa(src)` -- is player in coma

**Client Exports:**
- `IsInComa()` -- is local player in coma (used by hkneeds)

**NUI Callbacks:** Death screen UI callbacks (internal)

**Database Tables:**
- `hk_hospital_injuries` (character_id, injury data)
- `hk_hospital_bills` (character_id, amount, reason)
- `hk_hospital_respawns` (character_id, respawn data)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- `hkui` for notifications

**Called By:** Game death events, EMS players, admin commands

---

### hkhousing

**Purpose:** Property ownership system -- buy/sell houses, lock/unlock doors, property stash (inventory storage inside houses), enter/leave house interiors.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`

**Config:** House definitions, prices, interior coordinates.

**Server Events:**
- `hkhousing:server:getBuildingStatuses` -- get ownership status of buildings
- `hkhousing:server:getHouses` -- get all houses
- `hkhousing:server:isOwner` -- check house ownership
- `hkhousing:server:buyDirect` -- buy a house
- `hkhousing:server:sellDirect` -- sell a house
- `hkhousing:server:toggleLock` -- lock/unlock door
- `hkhousing:server:getLockState` -- get lock state
- `hkhousing:server:getStash` -- get house stash contents
- `hkhousing:server:saveStash` -- save house stash contents

**Client Events:**
- `hkhousing:client:houses` -- receive house list
- `hkhousing:client:isOwner` -- ownership check result
- `hkhousing:client:lockState` -- lock state result
- `hkhousing:client:buildingStatuses` -- building status map
- `hkhousing:client:openStash` -- open stash UI
- `hkhousing:enterHouse` / `hkhousing:leaveHouse` -- enter/leave interior
- `hkhousing:client:cmdEnter` -- command to enter nearest house
- `hkhousing:client:cmdPreview` -- preview house interior
- `hkhousing:client:forceLeave` -- force leave (sold house)
- `hkhousing:client:sold` / `purchased` -- buy/sell confirmation
- `hkhousing:client:adminGetPos` -- admin position tool

**Client Exports:**
- `GetCurrentHouseId()` -- get house ID player is currently in
- `IsPreviewMode()` -- is player in preview mode

**NUI Callbacks:** None (uses target/interaction system)

**Database Tables:**
- `hk_houses` (house definitions)
- `hk_house_owners` (character_id, house_id)
- `hk_house_stash` (house_id, items JSON)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- `hkui` for notifications

**Called By:** Player interaction at house doors

---

### hkinsurance

**Purpose:** Vehicle insurance system and firearms certificate application/approval system. Insurance desk for purchasing policies, filing claims, viewing insurance cards. Separate firearms desk for certificate applications (requires police approval).

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`, `HK-Inventory`, NUI

**Server Events:**
- `hkinsurance:server:openOffice` -- open insurance office
- `hkinsurance:server:purchase` -- purchase insurance policy
- `hkinsurance:server:deskStatus` -- get desk status
- `hkinsurance:server:retrieveDocument` -- retrieve insurance document
- `hkinsurance:server:buyFirearmsCertificate` -- apply for firearms cert
- `hkinsurance:server:requestFirearmsApprovals` -- get pending approvals (police)
- `hkinsurance:server:approveFirearms` -- approve firearms application
- `hkinsurance:server:denyFirearms` -- deny firearms application
- `hkinsurance:server:retrieveInsuranceDoc` -- retrieve insurance document
- `hkinsurance:server:fileClaim` -- file insurance claim
- `hkinsurance:server:requestCard` -- request insurance card
- `hkinsurance:server:cancel` -- cancel insurance policy

**Client Events:**
- Insurance UI open/close and data receive events (internal)

**NUI Callbacks:**
- `close`, `purchase`, `fileClaim`, `cancel`, `viewCard`
- `closeDesk`, `requestDeskStatus`, `retrieveDocument`
- `buyFirearms`, `requestFirearmsApprovals`, `approveFirearms`, `denyFirearms`

**Exports:** None

**Database Tables:**
- `hk_insurance` (character_id, vehicle plate, policy type, expiry)
- `hk_firearms_applications` (character_id, status, applied_at)
- `hk_firearms_licences` (character_id, approved_by, granted_at)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- `hkui` for notifications

**Called By:** Player interaction at insurance office / firearms desk

---

### hkinventory

**Purpose:** Core inventory system -- items stored per character, death bag mechanic (drop items on death for looting).

**fxmanifest.lua:** depends on `hkcore`, NUI for death bag UI

**Server Events:**
- `hkinv:server:openDeathBag` -- open a death bag to view contents
- `hkinv:server:lootDeathBag` -- loot items from a death bag

**Client Events:**
- `hkinv:client:deathBagCreated` -- death bag spawned in world
- `hkinv:client:yourDeathBag` -- your own death bag notification
- `hkinv:client:deathBagRemoved` -- death bag despawned
- `hkinv:client:deathBagGone` -- death bag no longer exists
- `hkinv:client:showDeathBag` -- open death bag UI

**NUI Callbacks:**
- `closeDeathBag` -- close death bag UI
- `lootDeathBag` -- loot from death bag

**Server Exports (CRITICAL -- used by many resources):**
- `AddItem(src, itemId, amount)` -- add item to player inventory
- `RemoveItem(src, itemId, amount)` -- remove item from inventory
- `HasItem(src, itemId, amount)` -- check if player has item
- `GetInventory(src)` -- get full inventory

**Database Tables:**
- `hk_inventory` (character_id, item_id, quantity)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`

**Called By:** Many resources via exports (hkeconomy, hktrade, hkfuel, etc.)

---

### hkjobs

**Purpose:** Job center system -- take/quit jobs, toggle duty, boss management (hire/fire/promote/demote), taxi meter, invoicing system, job minigames. Central job management resource.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`, `hklicence`, NUI, multiple shared configs

**Config:** Job definitions, job center locations, duty toggle locations, boss office locations, salary amounts, licence requirements per job.

**Server Events:**
- `hkjobs:server:playerLoaded` -- player loaded, init job data
- `hkjobs:server:getJobInfo` -- get current job info
- `hkjobs:server:takeJob` -- accept a job
- `hkjobs:server:quitJob` -- quit current job
- `hkjobs:server:toggleDuty` -- toggle on/off duty
- `hkjobs:server:setJob` -- set job (internal)
- `hkjobs:server:getColleagues` -- get list of colleagues
- `hkjobs:server:announcement` -- send job announcement
- `hkjobs:server:sendInvoice` -- send invoice to player
- `hkjobs:server:taxiMeter` -- taxi meter fare calculation
- `hkjobs:server:bossAction` -- boss menu action (deposit, withdraw, etc.)
- `hkjobs:server:bossPlayerAction` -- boss action on a player (hire, fire, promote, demote)
- `hkjobs:server:jobAction` -- generic job action
- `hkjobs:server:minigameStart` -- start a job minigame
- `hkjobs:server:minigameComplete` -- complete a job minigame

**Client Events:** Job UI events (internal NUI communication)

**Server Exports (CRITICAL -- used by many resources):**
- `AdminSetJob(src, jobName)` -- admin set job
- `GetPlayerJob(src)` -- get player's full job object
- `GetPlayerJobName(src)` -- get job name string
- `IsPlayerOnDuty(src)` -- check duty status
- `SetPlayerJob(src, jobName)` -- set player's job
- `AdminSetDuty(src, state)` -- admin set duty
- `AdminSetGrade(src, grade)` -- admin set grade

**NUI Callbacks:** Job center UI, boss menu UI, taxi meter UI (internal)

**Database Tables:**
- `hk_job_grades` (CREATE IF NOT EXISTS -- job_name, grade, label, salary, is_boss)
- Uses `hk_jobs`, `hk_character_jobs`, `hk_money`

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- `exports.hklicence:HasLicence()` -- check licence for job requirements
- `hkui` for notifications

**Called By:** Player interaction at job centers, boss offices; other resources via exports

---

### hklicence

**Purpose:** DVLA licence system -- theory test (multiple choice questions with images), practical driving test (checkpoint route), licence categories (car, motorcycle, hgv, boat, pilot), points and disqualification system.

**fxmanifest.lua:** depends on `oxmysql`, `hkcore`, `hkui`, NUI with test question images

**Config:** Theory questions per category, passing scores, practical test routes, licence category definitions, penalty point thresholds.

**Server Events:**
- `hklicence:server:ensureLicenceItems` -- ensure licence items exist
- `hklicence:server:submitTheory` -- submit theory test answers
- `hklicence:server:dvlaMenuRequest` -- open DVLA menu
- `hklicence:server:dvlaStartTheory` -- start theory test
- `hklicence:server:dvlaStartPractical` -- start practical test
- `hklicence:server:dvlaInteract` -- DVLA desk interaction
- `hklicence:server:requestTheoryStart` -- request to start theory
- `hklicence:server:requestPracticalStart` -- request to start practical
- `hklicence:server:practicalProgress` -- practical test checkpoint progress
- `hklicence:server:practicalPassed` -- practical test passed
- `hklicence:server:practicalFailed` -- practical test failed

**Client Events:** Theory test NUI, practical test checkpoint UI (internal)

**Server Exports (CRITICAL -- used by job resources):**
- `HasLicence(charId, category)` -- check if character has a licence
- `GetLicences(charId)` -- get all licences for a character
- `GrantLicence(charId, category)` -- grant a licence
- `RevokeLicence(charId, category)` -- revoke a licence
- `GetLicenceSummary(charId)` -- get licence summary
- `AddLicencePoints(charId, points)` -- add penalty points
- `SetDisqualified(charId, state)` -- set disqualified status

**NUI Callbacks:** Theory test UI (question display, answer submission)

**Database Tables:**
- `hk_character_licenses` (character_id, category, granted_at)
- `hk_license_test_results` (character_id, category, test_type, score, passed)
- `hk_character_license_progress` (character_id, practical test progress)
- `hk_character_licence_status` (character_id, points, disqualified)
- `hk_licence_categories` (category definitions)
- `hk_licence_test_bundle` (theory test questions)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`
- `hkui` for notifications

**Called By:** Player interaction at DVLA office; other resources via HasLicence export (hkc_truckerjob, hkc_ubermission, hkjobs)

---

### hklostmc

**Purpose:** Lost MC clubhouse -- faction-restricted area with streamed map assets. Provides exports to check faction membership.

**fxmanifest.lua:** Map resource with streamed YTD/YDR/YMAP assets

**Server Events:**
- `hklostmc:server:requestAccess` -- request clubhouse access
- `hklostmc:requestMenu` -- open clubhouse menu

**Server Exports:**
- `IsLostMC(src)` -- is player in Lost MC gang
- `IsLostMCOrCartel(src)` -- is player in Lost MC or Cartel faction

**NUI Callbacks:** None

**Database Tables:** None (uses job system)

**Dependencies:**
- `exports.hkjobs:GetPlayerJob(src)` -- check job/gang membership

**Called By:** Player interaction at clubhouse door

---

### hkneeds

**Purpose:** Hunger, thirst, and stamina HUD system. Drains over time, affected by movement state (walking, running, sprinting). Pauses during coma.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, NUI HUD overlay

**Config:** Drain rates, sprint multipliers, food/drink restore amounts.

**Server Events:**
- `hkneeds:server:setMoveState` -- client reports movement state

**Client Events:** HUD update events (internal NUI)

**Server Exports:**
- `GetMoveState(src)` -- get player's current movement state

**NUI Callbacks:** None

**Database Tables:** None (state is ephemeral / in-memory)

**Dependencies:**
- `exports.hkcore:GetPlayerState()` -- get player stats (pcall wrapped)
- `exports.hkhospital:IsInComa()` -- skip drain during coma

**Called By:** Internal timer threads; other resources via GetMoveState export

---

### hknos

**Purpose:** Vehicle nitrous oxide system -- boost button, NUI gauge indicator, limited charges.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, NUI, client-only

**Config:** NOS power, duration, cooldown, max charges.

**Server Events:** None

**Client Events:** Internal boost activation

**NUI Callbacks:** NOS gauge UI (internal)

**Exports:** None

**Database Tables:** None (client-side state only)

**Dependencies:** `hkcore`, `hkui` (listed in manifest)

**Called By:** Player keybind while in vehicle

---

### hkpolice

**Purpose:** Comprehensive police system -- one of the largest resources. Covers MDT (Mobile Data Terminal), dispatch, evidence collection, scanner, arrests, internal affairs, insurance, certifications, warrants, cases, tickets, armory, police garage, undercover mode, crime director, active missions, forensics, freeze system, vehicle theft, documents, NPC custody, custody desk, traffic stops, spike strips, jail, VOIP integration, and more.

**fxmanifest.lua:** Extensive file lists:
- **Server scripts (25+):** sv_helpers, sv_exports, sv_currency_service, sv_anti_exploit, main, sv_duty, sv_dispatch, sv_reports, sv_evidence, sv_warrants, sv_cases, sv_tickets, sv_arrest, sv_armory, sv_garage, sv_vehicles, sv_certifications, sv_ia, sv_insurance, sv_licenses, sv_scanner, sv_mdt, sv_actions, sv_undercover, sv_crime_director, sv_active_missions, sv_action_logger, sv_f6bridge, sv_forensics, sv_freeze, sv_vehicle_theft, sv_documents, sv_npc_custody, sv_custody_desk
- **Client scripts (35+):** cl_globals, cl_helpers, cl_targeting, cl_interaction_service, cl_action_menu, main, cl_menu, cl_hud, cl_dispatch, cl_scanner, cl_npc_arrest, cl_mdt_nui, cl_traffic, cl_radial, cl_actions, cl_ambient, cl_clothing, cl_garage, cl_impound, cl_jobperms, cl_services, cl_spikes, cl_active_missions, cl_dispatch_fallback, cl_evidence_locker, cl_freeze_manager, cl_freeze_enforcer, cl_person_interaction, cl_jail, cl_voip, cl_forensics, cl_vehicle_theft, cl_entity_state, cl_cell_doors, cl_documents, cl_custody_desk

**Server Exports:**
- `IsPoliceOnDuty(src)` -- is player a police officer on duty
- `IsPolice(src)` -- is player a police officer (any duty state)
- `GetDutyTime(charId, daysBack)` -- get duty hours in last N days

**Server Events:** Dozens across all sub-files (dispatch, arrests, evidence, warrants, etc.)

**Client Events:** Dozens across all sub-files (HUD, dispatch, MDT, scanner, etc.)

**NUI Callbacks:** MDT interface, dispatch panel, scanner UI, evidence UI

**Database Tables:** Multiple police-specific tables (warrants, cases, tickets, evidence, certifications, IA records, custody records, etc.)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, `HasRole`, money functions
- `exports.hkjobs:GetPlayerJob(src)`, `IsPlayerOnDuty(src)`
- `hkui`, `hktarget` for interaction points

**Called By:** Police officers on duty; dispatch system; admin commands

---

### hkregistration

**Purpose:** Character registration -- first-time name entry for a new character slot. NUI form for first name, last name.

**fxmanifest.lua:** depends on `oxmysql`, NUI

**Config:** None

**Server Exports:**
- `IsRegistered(src)` -- check if player has a registered character
- `GetRegistration(src)` -- get registration data

**Server Events:** None (uses exports only)

**Client Events:**
- `hkregistration:open` -- open registration form for a slot

**NUI Callbacks:**
- `submitRegistration` -- submit name
- `closeRegistration` -- close form

**Database Tables:** Uses `hk_accounts`, `hk_characters` (reads/writes)

**Dependencies:** `oxmysql`

**Called By:** Character selection flow (hkcore)

---

### hkrentals

**Purpose:** Vehicle rental system -- rental depots with fleet vehicles, NPC task system for rental employees, outfit enforcement for on-duty rental staff.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `hkjobs`, `hksociety`, `oxmysql`

**Config:** Rental depot locations, fleet definitions, pricing tiers, NPC task types.

**Server Events:**
- `hkrentals:server:getFleet` -- get available rental fleet
- `hkrentals:server:processRental` -- process a vehicle rental
- `hkrentals:server:processReturn` -- process vehicle return
- `hkrentals:server:checkMyRental` -- check player's active rental
- `hkrentals:server:getActiveRentals` -- get all active rentals (staff)
- `hkrentals:server:getNPCTasks` -- get NPC tasks for staff
- `hkrentals:server:acceptNPCTask` -- accept an NPC task
- `hkrentals:server:getNearbyPlayers` -- get nearby players for rental
- `hkrentals:server:checkEmployee` -- check if player is rental employee
- `hkrentals:server:requestOutfit` -- request duty outfit

**Client Events:** Rental UI events (internal)

**NUI Callbacks:** Rental desk UI (internal)

**Exports:** None

**Database Tables:**
- `hk_rental_fleet` (vehicle model, depot, price, availability)
- `hk_rentals` (character_id, vehicle, rented_at, returned_at)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- `exports.hkjobs:GetPlayerJob(src)` -- check rental employee job
- `exports.hksociety:GetSocietyMoney()` -- society fund access
- `hkui` for notifications

**Called By:** Player interaction at rental depots

---

### hksociety

**Purpose:** Society/organization management -- each job can have a society with shared funds. Boss actions: deposit/withdraw society money, hire/fire/promote/demote members. Money laundering (dirty to society).

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `oxmysql`

**Config:** Society definitions seeded per job, grade structures.

**Server Events:**
- `hksociety:server:getInfo` -- get society info (members, grades, money)
- `hksociety:server:deposit` -- deposit cash into society
- `hksociety:server:withdraw` -- withdraw cash from society
- `hksociety:server:hire` -- hire a player into the society
- `hksociety:server:fire` -- fire a member
- `hksociety:server:promote` -- promote a member
- `hksociety:server:demote` -- demote a member
- `hksociety:server:washMoney` -- launder dirty money into society
- `hksociety:server:getNearbyPlayers` -- get nearby players for hiring

**Client Events:** Society menu UI events (internal)

**Server Exports:**
- `GetSocietyMoney(jobName)` -- get society balance
- `AddSocietyMoney(jobName, amount)` -- add to society funds
- `RemoveSocietyMoney(jobName, amount)` -- remove from society funds
- `GetMoney(jobName)` -- alias for GetSocietyMoney
- `DepositMoney(jobName, amount)` -- alias for AddSocietyMoney
- `WithdrawMoney(jobName, amount)` -- alias for RemoveSocietyMoney

**NUI Callbacks:** Society management UI (internal)

**Database Tables:**
- `hk_job_grades` (CREATE IF NOT EXISTS -- with FK to hk_jobs)
- `hk_societies` (job_name, label, money)
- `hk_society_logs` (job_name, character_id, action, amount, detail)
- Also reads/writes `hk_character_jobs`, `hk_characters`, `hk_money`

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)`, money functions
- Waits for `hk_jobs` table to exist before init

**Called By:** Boss players via society menu; other resources via exports (hkrentals)

---

### hktarget

**Purpose:** 3D interaction targeting framework -- adds interaction points to world positions, entities, NPCs, and zones. Other resources register targets and the player interacts via crosshair proximity.

**fxmanifest.lua:** depends on `hkcore`, client-only

**Config:** Interaction distance, crosshair settings.

**Client Events:**
- `hktarget:addTarget` -- add a world target
- `hktarget:removeTarget` -- remove a world target
- `hktarget:addNPC` -- add NPC interaction target
- `hktarget:removeNPC` -- remove NPC target
- `hktarget:addZone` -- add zone interaction
- `hktarget:removeZone` -- remove zone
- `hktarget:addEntityTarget` -- add entity target
- `hktarget:removeEntityTarget` -- remove entity target

**Client Exports:**
- `AddTarget(data)` -- add interaction target at world position
- `RemoveTarget(id)` -- remove target by ID
- `AddEntityTarget(entity, data)` -- add target on entity
- `RemoveEntityTarget(entity)` -- remove entity target
- `AddNPC(data)` -- add NPC with interaction options
- `RemoveNPC(id)` -- remove NPC
- `AddZone(data)` -- add interaction zone
- `RemoveZone(id)` -- remove zone

**Server Events:** None

**NUI Callbacks:** None

**Database Tables:** None

**Dependencies:** `hkcore` (listed in manifest)

**Called By:** Many resources register targets (hkhousing, hkrentals, hkpolice, hkfuel, hkgarage, hkinsurance, etc.)

---

### hktrade

**Purpose:** Player-to-player trading system -- request trade, both players set offers (items + money), both confirm, items and money swap atomically with rollback on failure.

**fxmanifest.lua:** depends on `hkcore`, `hkui`, `hkinventory`, `oxmysql`, NUI

**Config:** Trade distance, timeout settings.

**Server Events:**
- `hktrade:server:requestTrade` -- send trade request to nearby player
- `hktrade:server:acceptTrade` -- accept trade request
- `hktrade:server:declineTrade` -- decline trade request
- `hktrade:server:updateOffer` -- update trade offer (items/money)
- `hktrade:server:setReady` -- set ready status
- `hktrade:server:cancelTrade` -- cancel active trade

**Client Events:** Trade UI events (internal NUI)

**NUI Callbacks:** Trade UI (offer management, ready toggle, confirm/cancel)

**Exports:** None

**Database Tables:**
- `hk_trade_log` (player1, player2, items exchanged, amounts, timestamp)

**Dependencies:**
- `exports.hkcore:GetCharacterId(src)` -- character IDs
- `exports.hkinventory:AddItem()`, `RemoveItem()`, `HasItem()`, `GetInventory()`, `GetItemCount()` -- item operations
- `hkui` for notifications

**Called By:** Player interaction with nearby players

---

### hkui

**Purpose:** Core UI framework -- provides notifications, help text overlay, generic HUD panels, and money update display. Send-only NUI (no callbacks needed). Other resources use hkui exports/events to show UI elements.

**fxmanifest.lua:** client-only with NUI

**Config:** None

**Client Events:**
- `hkui:notify` -- show a notification (title, msg, duration)
- `hkui:help` -- show help text
- `hkui:hudShow` -- show a HUD panel (id, title, lines, footer, progress)
- `hkui:hudUpdate` -- update a HUD panel
- `hkui:hudHide` -- hide a HUD panel
- `hkui:updateMoney` -- show money change indicator
- `hkui:closeAllPanels` -- close all open NUI panels (with `except` param)

**Client Exports:**
- `Help(msg)` -- show help text
- `Notify(title, msg, duration)` -- show notification
- `HudShow(id, title, lines, footer, progress)` -- show HUD panel
- `HudUpdate(id, patch)` -- update HUD panel
- `HudHide(id)` -- hide HUD panel

**Server Events:** None

**NUI Callbacks:** None (send-only)

**Database Tables:** None

**Dependencies:** None (standalone client-side)

**Called By:** Nearly every resource that needs to show UI feedback

---

## Quick Lookup: "Which resource handles X?"

| Game Mechanic | Resource |
|---|---|
| Character creation / registration | `hkregistration`, `hkcore` |
| Character appearance / clothing | `hkcore` (character creator) |
| Player money (cash/bank/dirty/crypto) | `hkcore` (core), `hkeconomy` (advanced) |
| Money laundering | `hkeconomy` (processing stations), `hksociety` (wash to org) |
| Cryptocurrency trading/mining | `hkeconomy` |
| Crafting items | `hkeconomy` |
| Shops (ingredient/black market) | `hkeconomy` |
| Contraband delivery jobs | `hkeconomy` |
| Inventory (items) | `hkinventory` |
| Player-to-player trading | `hktrade` |
| Jobs (take/quit/duty) | `hkjobs` |
| Boss management (hire/fire) | `hkjobs`, `hksociety` |
| Organization funds | `hksociety` |
| Driving licence / theory test | `hklicence` |
| Vehicle garage / storage | `hkgarage` |
| Vehicle fuel | `hkfuel` |
| Vehicle insurance | `hkinsurance` |
| Vehicle rental | `hkrentals` |
| Vehicle impound | `hkgarage` (impound section) |
| Vehicle NOS | `hknos` |
| Vehicle drift mode | `hkdrift` |
| Property ownership / stash | `hkhousing` |
| Death / respawn / hospital | `hkhospital` |
| Hunger / thirst / stamina | `hkneeds` |
| Police (all law enforcement) | `hkpolice` |
| Firearms certificate | `hkinsurance` |
| Gang territories | `hkgangs` |
| Lost MC clubhouse | `hklostmc` |
| PVP kill tracking | `hkc_pvp` |
| Trucker job | `hkc_truckerjob` |
| Taxi / private hire job | `hkc_ubermission` |
| New player intro flight | `hk-prologuemission` |
| Bug reports / suggestions | `HK-debug` |
| 3D interaction targeting | `hktarget` |
| Notifications / help text | `hkui` |
| HUD panels | `hkui` |

---

## Database Schema Summary

| Table | Resource | Key Columns |
|---|---|---|
| `hk_accounts` | hkcore | Player account data |
| `hk_characters` | hkcore | id, first_name, last_name, account_id |
| `hk_character_appearances` | hkcore | character_id, model, components, props |
| `hk_money` | hkcore | character_id, cash, bank, dirty, crypto |
| `hk_jobs` | hkjobs | name, label (job definitions) |
| `hk_character_jobs` | hkjobs | character_id, job_name, on_duty, grade |
| `hk_job_grades` | hksociety | job_name, grade, label, salary, is_boss |
| `hk_societies` | hksociety | job_name, label, money |
| `hk_society_logs` | hksociety | job_name, character_id, action, amount, detail |
| `hk_vehicles` | hkgarage | plate, model, owner_id, garage_id, props, state |
| `hk_garage_slots` | hkgarage | character_id, max_slots |
| `hk_vehicle_fuel` | hkfuel | plate, fuel_level |
| `hk_inventory` | hkinventory | character_id, item_id, quantity |
| `hk_character_licenses` | hklicence | character_id, category, granted_at |
| `hk_license_test_results` | hklicence | character_id, category, test_type, score, passed |
| `hk_character_license_progress` | hklicence | character_id, practical progress |
| `hk_character_licence_status` | hklicence | character_id, points, disqualified |
| `hk_licence_categories` | hklicence | category definitions |
| `hk_licence_test_bundle` | hklicence | theory test questions |
| `hk_insurance` | hkinsurance | character_id, plate, policy_type, expiry |
| `hk_firearms_applications` | hkinsurance | character_id, status, applied_at |
| `hk_firearms_licences` | hkinsurance | character_id, approved_by, granted_at |
| `hk_houses` | hkhousing | house definitions |
| `hk_house_owners` | hkhousing | character_id, house_id |
| `hk_house_stash` | hkhousing | house_id, items JSON |
| `hk_hospital_injuries` | hkhospital | character_id, injury data |
| `hk_hospital_bills` | hkhospital | character_id, amount, reason |
| `hk_hospital_respawns` | hkhospital | character_id, respawn data |
| `hk_rental_fleet` | hkrentals | model, depot, price, availability |
| `hk_rentals` | hkrentals | character_id, vehicle, rented_at, returned_at |
| `hk_crypto_wallets` | hkeconomy | character_id, token, amount |
| `hk_crypto_market_rates` | hkeconomy | token, rate |
| `hk_crypto_rate_history` | hkeconomy | token, rate, timestamp |
| `hk_miner_ownership` | hkeconomy | character_id, rig_type |
| `hk_mining_rentals` | hkeconomy | character_id, rig_type, expires_at |
| `hk_funds_processing` | hkeconomy | character_id, amount, status |
| `hk_crafting_queue` | hkeconomy | character_id, recipe, started_at |
| `hk_job_cooldowns` | hkeconomy | character_id, job_type, cooldown_until |
| `hk_economy_log` | hkeconomy | audit log |
| `hk_trade_log` | hktrade | player1, player2, items, amounts |
| `hk_trucker_deliveries` | hkc_truckerjob | character_id, mission, payout |
| `hkc_uber_stats` | hkc_ubermission | character_id, fares, total_earned |
| `hkc_pvp_kills` | hkc_pvp | killer_id, victim_id, weapon, zone |

---
---

# Other Resource Folders

The following folders contain standard Cfx.re default resources, asset-streaming resources, or are empty placeholders. They are documented here for completeness.

---

## [local] Folder

**Status:** Empty (contains only `.gitkeep`). Reserved for local-only development resources.

---

## [managers] Folder

Standard Cfx.re server-data managers. These are unmodified default FiveM resources.

### mapmanager

**Purpose:** Flexible handler for game type/map association. Standard Cfx.re resource.

**Author:** Cfx.re

**Server Exports:**
- `getCurrentGameType()`, `getCurrentMap()`, `changeGameType()`, `changeMap()`
- `doesMapSupportGameType()`, `getMaps()`, `roundEnded()`

**Scripts:** `mapmanager_shared.lua`, `mapmanager_client.lua`, `mapmanager_server.lua`

---

### spawnmanager

**Purpose:** Unified player spawn handling. Prevents resources from implementing custom spawn logic. Standard Cfx.re resource.

**Author:** Cfx.re

**Scripts:** `spawnmanager.lua` (client-side)

**Events:** Fires `playerSpawned` event (consumed by hkcore, hkhospital, hk-prologuemission, hkc_pvp)

---

## [system] Folder

Core FiveM system resources. All are unmodified Cfx.re defaults.

### baseevents

**Purpose:** Provides basic death and vehicle events for developers. Many resources depend on these events.

**Author:** Cfx.re

**Scripts:** `deathevents.lua` (client), `vehiclechecker.lua` (client), `server.lua`

**Events Provided:**
- `baseevents:onPlayerDied` -- player died (non-PVP)
- `baseevents:onPlayerKilled` -- player killed by another player
- `baseevents:onPlayerWasted` -- player wasted
- `baseevents:enteredVehicle` / `leftVehicle` -- vehicle enter/exit

**Consumed By:** `hkc_pvp`, `hkhospital`

---

### hardcap

**Purpose:** Limits player count to `sv_maxclients` value from server.cfg.

**Author:** Cfx.re

**Scripts:** `client.lua`, `server.lua`

---

### rconlog

**Purpose:** Handles old-style server player management commands (RCON logging).

**Author:** Cfx.re

**Scripts:** `rconlog_client.lua`, `rconlog_server.lua`

---

### runcode

**Purpose:** Execute arbitrary server-side or client-side JavaScript/Lua code. Development tool only.

**Author:** Cfx.re

**Scripts:** `runcode_cl.lua`, `runcode_sv.lua`, `runcode_web.lua`, `runcode_shared.lua`, `runcode.js`, `runcode_ui.lua`

**NUI:** `web/nui.html`

**Warning:** Should only be used on development servers.

---

### sessionmanager

**Purpose:** Handles host lock for non-OneSync servers. Do not disable.

**Author:** Cfx.re

**Scripts:** `server/host_lock.lua`, `client/empty.lua`

---

### sessionmanager-rdr3

**Purpose:** Handles Social Club conductor session API for RedM. Not used for GTA5.

**Author:** Cfx.re

**Dependencies:** `yarn`

---

### [builders]/webpack

**Purpose:** Builds resources with webpack.

**Author:** Cfx.re

**Dependencies:** `yarn`

---

### [builders]/yarn

**Purpose:** Builds resources with yarn package manager.

**Author:** Cfx.re

---

## [test] Folder

Example and compatibility resources from Cfx.re defaults.

### example-loadscreen

**Purpose:** Example loading screen. Shows a static image during server load.

**Author:** Cfx.re

**Files:** `index.html`, `keks.css`, `bankgothic.ttf`, `loadscreen.jpg`

---

### fivem

**Purpose:** Compatibility wrapper that loads `basic-gamemode`.

**Author:** Cfx.re

**Dependency:** `basic-gamemode`

---

## [Police Skins] Folder

Custom ped model replacement resources for police department divisions. All follow the same pattern: stream `.ydd`, `.ytd`, `.yft`, `.ymt` files to replace default ped models.

| Resource | Description |
|---|---|
| `hkc_police_detective` | Police Detective ped replacement |
| `hkc_police_ems` | Police EMS ped replacement |
| `hkc_police_hway` | Highway patrol ped replacement |
| `hkc_police_ped` | Standard police ped replacement |
| `hkc_police_sheriff` | Sheriff ped replacement |
| `hkc_police_sheriffd` | Sheriff Department ped replacement |
| `hkc_police_swat` | SWAT ped replacement (s_m_y_swat_01) |

**Pattern for all:** `fx_version 'cerulean'`, streams `.ydd/.ytd/.yft/.ymt` from `stream/` folder. No scripts, no events, no exports, no DB.

---

## [Police Vehicles] Folder

**Status:** Empty. Reserved for custom police vehicle model streaming resources.
