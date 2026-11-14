import type { TeactNode } from '../../lib/teact/teact';
import { memo, useState } from '../../lib/teact/teact';

import useLang from '../../hooks/useLang';

import ProxySettings from '../common/ProxySettings';
import TabList from '../ui/TabList';

import styles from './AuthLoginTabs.module.scss';

type OwnProps = {
  children: TeactNode;
};

const AuthLoginTabs = ({ children }: OwnProps) => {
  const lang = useLang();
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    { title: lang('GriboLoginTab') },
    { title: lang('GriboProxyTab') },
  ];

  return (
    <div className={styles.root}>
      <TabList
        className={styles.tabs}
        tabs={tabs}
        activeTab={activeTab}
        onSwitchTab={setActiveTab}
      />
      {activeTab === 0 ? children : <ProxySettings />}
    </div>
  );
};

export default memo(AuthLoginTabs);
