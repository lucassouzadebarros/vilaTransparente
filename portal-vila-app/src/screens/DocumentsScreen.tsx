import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { ExternalLink, RefreshCw } from 'lucide-react-native';
import { Button, Card, Label, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { PortalDocument } from '../types';

export function DocumentsScreen() {
  const [items, setItems] = useState<PortalDocument[]>([]);

  async function load() {
    setItems(await api.documents());
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Documentos" subtitle="Atas, recibos e comprovantes" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.name}</Value>
            <Label>{item.type}</Label>
          </Row>
          {item.description ? <Label>{item.description}</Label> : null}
          <Button title="Abrir" icon={ExternalLink} variant="ghost" onPress={() => Linking.openURL(api.documentUrl(item.url))} />
        </Card>
      ))}
    </Screen>
  );
}
