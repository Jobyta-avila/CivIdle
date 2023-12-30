import classNames from "classnames";
import { useState } from "react";
import type { Resource } from "../definitions/ResourceDefinitions";
import type { PartialTabulate } from "../definitions/TypeDefinitions";
import { IOCalculation, getElectrificationStatus } from "../logic/BuildingLogic";
import { Config } from "../logic/Config";
import { GameFeature, hasFeature } from "../logic/FeatureLogic";
import { getBuildingIO, unlockedResources } from "../logic/IntraTickCache";
import { Tick } from "../logic/TickLogic";
import type { IBuildingData } from "../logic/Tile";
import { WorldScene } from "../scenes/WorldScene";
import { forEach, formatPercent, jsxMapOf, keysOf, reduceOf, safeAdd } from "../utilities/Helper";
import { Singleton } from "../utilities/Singleton";
import { L, t } from "../utilities/i18n";
import { playClick } from "../visuals/Sound";
import { BuildingColorComponent } from "./BuildingColorComponent";
import type { IBuildingComponentProps } from "./BuildingPage";
import { FormatNumber } from "./HelperComponents";

type Tab = "resources" | "buildings" | "transportation";

export function StatisticsBuildingBody({ gameState, xy }: IBuildingComponentProps): React.ReactNode {
   const building = gameState.tiles[xy].building as IBuildingData;
   if (building == null) {
      return null;
   }
   const [currentTab, setCurrentTab] = useState<Tab>("resources");
   let content: JSX.Element | null = null;
   if (currentTab === "resources") {
      content = <ResourcesTab gameState={gameState} xy={xy} />;
   } else if (currentTab === "buildings") {
      content = <BuildingTab gameState={gameState} xy={xy} />;
   } else if (currentTab === "transportation") {
      content = <TransportationTab gameState={gameState} xy={xy} />;
   }
   return (
      <div className="window-body column">
         <menu role="tablist">
            <button
               onClick={() => setCurrentTab("resources")}
               aria-selected={currentTab === "resources" ? true : false}
            >
               {t(L.StatisticsResources)}
            </button>
            <button
               onClick={() => setCurrentTab("buildings")}
               aria-selected={currentTab === "buildings" ? true : false}
            >
               {t(L.StatisticsBuildings)}
            </button>
            <button
               onClick={() => setCurrentTab("transportation")}
               aria-selected={currentTab === "transportation" ? true : false}
            >
               {t(L.StatisticsTransportation)}
            </button>
         </menu>
         {content}
         <BuildingColorComponent gameState={gameState} xy={xy} />
      </div>
   );
}

function BuildingTab({ gameState }: IBuildingComponentProps): React.ReactNode {
   return (
      <article role="tabpanel" className="f1" style={{ padding: "8px", overflow: "auto" }}>
         <div className="table-view sticky-header" style={{ height: "100%" }}>
            <table>
               <thead>
                  <tr>
                     <th></th>
                     {hasFeature(GameFeature.Electricity, gameState) ? <th></th> : null}
                     <th></th>
                     <th className="right">{t(L.Level)}</th>
                     <th className="right">
                        <div className="m-icon small">local_shipping</div>
                     </th>
                     <th className="right">
                        <div className="m-icon small">settings</div>
                     </th>
                  </tr>
               </thead>
               <tbody>
                  {keysOf(gameState.tiles)
                     .flatMap((xy) => {
                        const tile = gameState.tiles[xy];
                        const building = tile.building;
                        return tile.explored && building ? [{ building, xy }] : [];
                     })
                     .sort((a, b) =>
                        Config.Building[a.building.type]
                           .name()
                           .localeCompare(Config.Building[b.building.type].name()),
                     )
                     .map(({ building, xy }) => {
                        let icon = <div className="m-icon small text-green">check_circle</div>;
                        const notProducingReason = Tick.current.notProducingReasons[xy];
                        if (building.status !== "completed") {
                           icon = <div className="m-icon small text-orange">build_circle</div>;
                        } else if (notProducingReason) {
                           if (notProducingReason === "StorageFull") {
                              icon = <div className="m-icon small text-red">stroke_full</div>;
                           } else {
                              icon = <div className="m-icon small text-red">error</div>;
                           }
                        }
                        return (
                           <tr key={xy}>
                              <td>{icon}</td>
                              {hasFeature(GameFeature.Electricity, gameState) ? (
                                 <td>
                                    {getElectrificationStatus(xy, gameState) === "Active" ? (
                                       <div className="m-icon small text-orange">bolt</div>
                                    ) : null}
                                 </td>
                              ) : null}
                              <td>
                                 <div
                                    className="pointer"
                                    onClick={() => {
                                       Singleton().sceneManager.getCurrent(WorldScene)?.lookAtXy(xy);
                                    }}
                                 >
                                    {Config.Building[building.type].name()}
                                 </div>
                              </td>
                              <td className="right">
                                 <FormatNumber value={building.level} />
                              </td>
                              <td className="right">
                                 <FormatNumber
                                    value={
                                       gameState.transportation[xy]?.reduce(
                                          (prev, curr) => prev + curr.currentFuelAmount,
                                          0,
                                       ) ?? 0
                                    }
                                 />
                              </td>
                              <td
                                 className={classNames({
                                    "text-red": Tick.current.notProducingReasons[xy] === "NotEnoughWorkers",
                                    "text-right": true,
                                 })}
                              >
                                 <FormatNumber value={Tick.current.workersAssignment[xy] ?? 0} />
                              </td>
                           </tr>
                        );
                     })}
               </tbody>
            </table>
         </div>
      </article>
   );
}

function TransportationTab({ gameState }: IBuildingComponentProps): React.ReactNode {
   return (
      <article role="tabpanel" className="f1 column" style={{ padding: "8px", overflow: "auto" }}>
         <fieldset>
            <div className="row">
               <div className="f1">{t(L.StatisticsTransportationPercentage)}</div>
               <div className="text-strong">
                  {formatPercent(
                     reduceOf(
                        gameState.transportation,
                        (prev, k, v) => prev + v.reduce((prev, curr) => prev + curr.currentFuelAmount, 0),
                        0,
                     ) / Tick.current.workersUsed.Worker!,
                  )}
               </div>
            </div>
         </fieldset>
         <div className="table-view sticky-header f1">
            <table>
               <thead>
                  <tr>
                     <th></th>
                     <th>{t(L.StatisticsTransportationBuilding)}</th>
                     <th className="right">{t(L.StatisticsTransportationResource)}</th>
                     <th className="right">{t(L.StatisticsTransportationAmount)}</th>
                     <th className="right">
                        <div className="m-icon small">group</div>
                     </th>
                     <th className="right">
                        <div className="m-icon small">hourglass_empty</div>
                     </th>
                  </tr>
               </thead>
               <tbody>
                  {jsxMapOf(gameState.transportation, (xy, transportations) => {
                     return transportations.map((transportation, i) => {
                        const buildingType = gameState.tiles[xy].building?.type;
                        return (
                           <tr key={transportation.id}>
                              <td>
                                 {transportation.hasEnoughFuel ? (
                                    <div className="m-icon text-green small">check_circle</div>
                                 ) : (
                                    <div className="m-icon text-red small">error</div>
                                 )}
                              </td>
                              <td className="text-strong">
                                 {i === 0 && buildingType ? Config.Building[buildingType].name() : null}
                              </td>
                              <td>{Config.Resource[transportation.resource].name()}</td>
                              <td className="text-right">
                                 <FormatNumber value={transportation.amount} />
                              </td>
                              <td className="text-right">
                                 <FormatNumber value={transportation.currentFuelAmount} />
                              </td>
                              <td className="text-right">
                                 <FormatNumber
                                    value={(100 * transportation.ticksSpent) / transportation.ticksRequired}
                                 />
                                 %
                              </td>
                           </tr>
                        );
                     });
                  })}
               </tbody>
            </table>
         </div>
      </article>
   );
}

function ResourcesTab({ gameState }: IBuildingComponentProps): React.ReactNode {
   const [showTheoreticalValue, setShowTheoreticalValue] = useState(true);
   const inputs: PartialTabulate<Resource> = {};
   const outputs: PartialTabulate<Resource> = {};
   forEach(gameState.tiles, (xy, tile) => {
      const input = getBuildingIO(xy, "input", IOCalculation.Multiplier | IOCalculation.Capacity, gameState);
      const output = getBuildingIO(
         xy,
         "output",
         IOCalculation.Multiplier | IOCalculation.Capacity,
         gameState,
      );
      if (!showTheoreticalValue && Tick.current.notProducingReasons[xy]) {
         return;
      }
      forEach(input, (res, amount) => safeAdd(inputs, res, amount));
      forEach(output, (res, amount) => safeAdd(outputs, res, amount));
   });
   return (
      <article role="tabpanel" className="f1 column" style={{ padding: "8px", overflow: "auto" }}>
         <fieldset>
            <div className="row">
               <div className="f1">{t(L.ShowTheoreticalValue)}</div>
               <div
                  className={classNames({
                     "text-green": showTheoreticalValue,
                     "text-grey": !showTheoreticalValue,
                  })}
               >
                  <div
                     onClick={() => {
                        playClick();
                        setShowTheoreticalValue(!showTheoreticalValue);
                     }}
                     className="pointer m-icon"
                  >
                     {showTheoreticalValue ? "toggle_on" : "toggle_off"}
                  </div>
               </div>
            </div>
         </fieldset>
         <div className="table-view sticky-header f1">
            <table>
               <thead>
                  <tr>
                     <th></th>
                     <th className="right">{t(L.ResourceAmount)}</th>
                     <th className="right">
                        <div className="m-icon small">output</div>
                     </th>
                     <th className="right">
                        <div className="m-icon small">exit_to_app</div>
                     </th>
                  </tr>
               </thead>
               <tbody>
                  {keysOf(unlockedResources(gameState))
                     .sort((a, b) => Config.Resource[a].name().localeCompare(Config.Resource[b].name()))
                     .map((res) => {
                        const r = Config.Resource[res];
                        if (!r.canPrice || !r.canStore) {
                           return null;
                        }
                        const output = outputs[res] ?? 0;
                        const input = inputs[res] ?? 0;
                        return (
                           <tr key={res}>
                              <td>{r.name()}</td>
                              <td className="right">
                                 <FormatNumber
                                    value={
                                       Tick.current.resourcesByXy[res]?.reduce(
                                          (prev, curr) =>
                                             prev + (gameState.tiles[curr].building?.resources?.[res] ?? 0),
                                          0,
                                       ) ?? 0
                                    }
                                 />
                              </td>
                              <td className="right">
                                 <FormatNumber value={output} />
                              </td>
                              <td className={classNames({ right: true, "text-red": input > output })}>
                                 <FormatNumber value={input} />
                              </td>
                           </tr>
                        );
                     })}
               </tbody>
            </table>
         </div>
      </article>
   );
}
