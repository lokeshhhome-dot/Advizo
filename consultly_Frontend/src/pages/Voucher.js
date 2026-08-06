import React, { useEffect, useState } from "react";
import styles from "./Voucher.module.css";
import axios from "axios";
import { redirect, useOutletContext } from "react-router-dom";
import {
  fetchUserDetailsByIds,
  fetchVoucherData,
} from "../components/Redux/slices/UserSlices";
import { useDispatch, useSelector } from "react-redux";
import MoneyValue from "../components/Helper/MoneyValue";

function Voucher() {
  const dispatch = useDispatch();
  const [userId, setUserId] = useState(null);
  const [shopId, setShopId] = useState(null);
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop");
  const userId_params = params.get("userId");
  const { userDetails } = useSelector((state) => state.users);
  const { voucherData, loading } = useSelector((state) => state.users);
  const walletBalance = userDetails?.data?.walletBalance;
  useEffect(() => {
    const adminId = localStorage.getItem("client_u_Identity");
    const shopId = localStorage.getItem("shop_o_Identity");
    const shop = localStorage.getItem("shop");
    if (adminId && shopId) {
      setUserId(adminId);
      setShopId(shopId);
    }
  }, []);
  useEffect(() => {
    const resolvedUserId = userId || userId_params;
    if (!resolvedUserId) return;

    const token = localStorage.getItem("token");
    const shopIdStored = localStorage.getItem("shop_o_Identity");
    if (!token && !shopIdStored) return;

    dispatch(fetchUserDetailsByIds(resolvedUserId));
  }, [dispatch, userId, userId_params]);

  const handleRecharge = async (amount) => {
    console.log("amount", amount)
    localStorage.setItem("amount", amount)
    const newWindow = window.open("", "_blank");
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_HOST}/draft-order/create-draft-order`,
        {
          amount: amount,
          shop: shop || voucherData?.shop,
          title: "Recharge Amount",
          userId: userId,
        },
      );
      if (response.status === 200) {
        const data = response.data;
        console.log("data", data)
        newWindow.location.href = data.invoiceUrl;
      } else {
        newWindow.close();
      }
    } catch (error) {
      console.error(error);
      newWindow.close();
    }
  };

  useEffect(() => {
    if (shopId) {
      dispatch(fetchVoucherData(shopId));
    }
  }, [shopId]);

  const calculateTotalCoin = (totalCoin, extraCoin) => {
    return Number(totalCoin) + Number(extraCoin);
  };

  return (
    <div className={styles.voucherPage}>
      <h1 className={styles.title}>Add Money to Wallet</h1>

      <div className={styles.balanceSection}>
        {/* <span className={styles.balanceLabel}>Available balance:</span> */}
        <span className={styles.balanceValue}>
          Available Balance :{" "}
          <MoneyValue currency={voucherData?.shopCurrency}>
            {walletBalance?.toFixed(2) || "0.0"}
          </MoneyValue>
        </span>
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Popular Recharge</h2>
      </div>

      <div className={styles.cardGrid}>
        {voucherData?.voucherCode?.map((option) => {
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleRecharge(option.totalCoin)}
              className={`${styles.rechargeCard} ${option.badge ? styles.rechargeCardHighlighted : ""
                }`}
            >
              {option.extraCoin && (
                <span className={styles.badge}>{option.extraCoin}</span>
              )}
              <div className={styles.amount}>
                <MoneyValue currency={voucherData?.shopCurrency}>
                  {option.totalCoin}
                </MoneyValue>
              </div>
              <div className={styles.extra}>
                Total :{" "}
                <MoneyValue currency={voucherData?.shopCurrency}>
                  {calculateTotalCoin(option.totalCoin, option.extraCoin)}
                </MoneyValue>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Voucher;
